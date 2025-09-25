// Test runner that imports all the split test files
// This file can be used as an alternative to the original molpha.ts

import "./instructions/node-registry.test";
import "./instructions/create-data-source.test";
import "./instructions/create-feed.test";
import "./instructions/permit.test";
import "./instructions/subscription.test";
import "./instructions/signature-verification.test";
import "./integration/integration.test";

console.log("All test modules loaded successfully!");
