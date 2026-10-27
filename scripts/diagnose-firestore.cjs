/* eslint-disable @typescript-eslint/no-require-imports */
const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// This deliberately mirrors lib/firebase-admin.ts. Do not read an ambient
// GOOGLE_CLOUD_PROJECT here: it may refer to an unrelated local project.
const projectId = "tany-whatsapp";
const appName = "tany-messaging-admin";
const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const app =
  getApps().find((candidate) => candidate.name === appName) ??
  initializeApp({ credential: applicationDefault(), projectId }, appName);
const db = getFirestore(app);
const verticals = new Set([
  "motos", "eats", "cabs", "ecom", "expert", "gaming",
  "garage", "meat", "meds", "retail", "salon", "sport",
]);

function requiredShape(data) {
  return {
    name: typeof data?.name === "string",
    vertical: typeof data?.vertical === "string" && verticals.has(data.vertical),
    active: typeof data?.active === "boolean",
    whatsappPhoneNumberId: typeof data?.whatsappPhoneNumberId === "string",
  };
}

async function main() {
  console.info("[FIREBASE_ADMIN_DIAG]", {
    projectId,
    credentialMode: "applicationDefault",
    emulatorEnabled,
    nodeEnv: process.env.NODE_ENV ?? "unset",
  });
  try {
    const snapshot = await db.collection("businesses").doc("demo-eats").get();
    const data = snapshot.data();
    console.info("[FIRESTORE_DIAG_RESULT]", {
      documentExists: snapshot.exists,
      documentId: snapshot.id,
      fieldNames: data ? Object.keys(data).sort() : [],
      requiredFields: requiredShape(data),
    });
    if (!snapshot.exists) process.exitCode = 2;
    else if (Object.values(requiredShape(data)).some((valid) => !valid)) process.exitCode = 3;
  } catch (error) {
    const details = error && typeof error === "object" ? error : {};
    console.error("[FIRESTORE_DIAG_FAILURE]", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: details.code,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

main();
