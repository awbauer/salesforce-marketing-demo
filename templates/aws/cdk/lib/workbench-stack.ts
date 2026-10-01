import * as path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as actions from "aws-cdk-lib/aws-elasticloadbalancingv2-actions";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface WorkbenchStackProps extends StackProps {
  /** The DNS name people will open (covered by the certificate), such as workbench.example.com. */
  domainName: string;
  /** ACM certificate for the load balancer's HTTPS listener (must be in the stack's region). */
  certificateArn: string;
  /** A globally unique prefix for the Cognito hosted sign-in domain. */
  cognitoDomainPrefix: string;
  /** Comma-separated emails allowed in. Also the only addresses created as Cognito users. */
  allowedEmails: string;
  /** Name of an existing Secrets Manager secret holding a Bedrock API key (chatMode=bedrock). */
  bedrockSecretName?: string;
  chatMode: string;
}

/**
 * One Fargate task running the workbench container, state on EFS, behind an HTTPS load balancer
 * that signs users in with Cognito. A single-instance demo deployment, not a scalable service:
 * the Durable Object runtime keeps its state in files on one volume, so keep desiredCount at 1.
 */
export class WorkbenchStack extends Stack {
  constructor(scope: Construct, id: string, props: WorkbenchStackProps) {
    super(scope, id, props);
    const emails = props.allowedEmails
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    // Public subnets only: no NAT gateway cost, and the task is reachable only from the load balancer.
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC }],
    });

    const fileSystem = new efs.FileSystem(this, "State", {
      vpc,
      encrypted: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const accessPoint = fileSystem.addAccessPoint("StateAccess", {
      path: "/state",
      posixUser: { uid: "1000", gid: "1000" },
      createAcl: { ownerUid: "1000", ownerGid: "1000", permissions: "750" },
    });

    const signingKey = new secretsmanager.Secret(this, "ConfirmationSigningKey", {
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    const userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const client = userPool.addClient("LoadBalancer", {
      generateSecret: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`https://${props.domainName}/oauth2/idpresponse`],
      },
    });
    const domain = userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: props.cognitoDomainPrefix },
    });
    for (const email of emails)
      new cognito.CfnUserPoolUser(this, `User${email.replace(/[^a-zA-Z0-9]/g, "")}`, {
        userPoolId: userPool.userPoolId,
        username: email,
        userAttributes: [
          { name: "email", value: email },
          { name: "email_verified", value: "true" },
        ],
      });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc });
    const task = new ecs.FargateTaskDefinition(this, "Task", { cpu: 1024, memoryLimitMiB: 2048 });
    task.addVolume({
      name: "state",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        transitEncryption: "ENABLED",
        authorizationConfig: { accessPointId: accessPoint.accessPointId, iam: "ENABLED" },
      },
    });
    fileSystem.grantReadWrite(task.taskRole);

    const lb = new elbv2.ApplicationLoadBalancer(this, "Lb", { vpc, internetFacing: true });
    const secrets: Record<string, ecs.Secret> = {
      CONFIRMATION_SIGNING_KEY: ecs.Secret.fromSecretsManager(signingKey),
    };
    if (props.chatMode === "bedrock" && props.bedrockSecretName)
      secrets.AWS_BEARER_TOKEN_BEDROCK = ecs.Secret.fromSecretsManager(
        secretsmanager.Secret.fromSecretNameV2(this, "BedrockKey", props.bedrockSecretName),
      );

    const container = task.addContainer("Workbench", {
      // Built from the repository root with the instance profile that is on disk at deploy time.
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, "../../../.."), {
        file: "templates/container/Dockerfile",
      }),
      portMappings: [{ containerPort: 8787 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "workbench" }),
      environment: {
        ENVIRONMENT: "local", // fixture Salesforce; sign-in is still enforced by AUTH_MODE
        AUTH_MODE: "alb-oidc",
        AWS_REGION: this.region,
        ALB_ARN: lb.loadBalancerArn,
        OIDC_ISSUER: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
        ALLOWED_EMAILS: emails.join(","),
      },
      secrets,
    });
    container.addMountPoints({
      containerPath: "/app/.wrangler/state",
      sourceVolume: "state",
      readOnly: false,
    });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: task,
      desiredCount: 1,
      assignPublicIp: true,
      healthCheckGracePeriod: Duration.seconds(120),
      minHealthyPercent: 0, // one task, one volume: replace rather than overlap
      maxHealthyPercent: 100,
    });
    fileSystem.connections.allowDefaultPortFrom(service);

    const listener = lb.addListener("Https", {
      port: 443,
      certificates: [{ certificateArn: props.certificateArn }],
      defaultAction: new actions.AuthenticateCognitoAction({
        userPool,
        userPoolClient: client,
        userPoolDomain: domain,
        next: elbv2.ListenerAction.forward([
          new elbv2.ApplicationTargetGroup(this, "Targets", {
            vpc,
            port: 8787,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [service],
            healthCheck: { path: "/api/health", interval: Duration.seconds(30) },
            deregistrationDelay: Duration.seconds(10),
          }),
        ]),
      }),
    });
    lb.addRedirect({ sourcePort: 80, targetPort: 443 });
    void listener;

    new CfnOutput(this, "LoadBalancerDns", {
      value: lb.loadBalancerDnsName,
      description:
        "Point a DNS record for the certificate's domain at this, then open it over HTTPS.",
    });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
  }
}
