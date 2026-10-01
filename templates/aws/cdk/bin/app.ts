#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { WorkbenchStack } from "../lib/workbench-stack";

const app = new App();
const context = (key: string) => app.node.tryGetContext(key) as string | undefined;
const required = (key: string) => {
  const value = context(key);
  if (!value) throw new Error(`Pass -c ${key}=<value>. See templates/aws/README.md.`);
  return value;
};

new WorkbenchStack(app, context("stackName") ?? "MarketingWorkbench", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: context("region") ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  domainName: required("domainName"),
  certificateArn: required("certificateArn"),
  cognitoDomainPrefix: required("cognitoDomainPrefix"),
  allowedEmails: required("allowedEmails"),
  bedrockSecretName: context("bedrockSecretName"),
  chatMode: context("chatMode") ?? "bedrock",
});
