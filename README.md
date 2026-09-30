# Marketing Workbench

An agent-first demo workbench for a marketer using Salesforce CRM, Marketing Cloud Next, Data 360 and Agentforce. The playbook setup is being completed in this branch; see [`docs/architecture.md`](docs/architecture.md) for what it does and [`docs/getting-started-for-agents.md`](docs/getting-started-for-agents.md) for the pickup sequence.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:5173`. The default instance runs locally with fictional data and no cloud account; chat uses a local Ollama model when one is running and scripted fixtures otherwise.
