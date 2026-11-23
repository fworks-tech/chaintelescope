import * as cdk from "aws-cdk-lib";
import { buildApi } from "../lib/api.js";
import { buildData } from "../lib/data.js";
import { buildNetwork } from "../lib/network.js";
import { buildObservability } from "../lib/observability.js";

const app = new cdk.App();

const stack = new cdk.Stack(app, "Chaintelescope", {
  env: {
    account: process.env["CDK_DEFAULT_ACCOUNT"] ?? "123456789012",
    region: process.env["CDK_DEFAULT_REGION"] ?? "us-east-1",
  },
  description: "ChainTelescope API on Fargate + RDS (dev baseline)",
});

const network = buildNetwork(stack);
const data = buildData(stack, network);
const api = buildApi(stack, network, data, {
  webOrigin: process.env["WEB_ORIGIN"] ?? "https://example.com",
});
buildObservability(stack, api, data);
