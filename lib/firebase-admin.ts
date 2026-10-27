import "server-only";
import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// GOOGLE_CLOUD_PROJECT can belong to another local project. This service owns
// tany-whatsapp, so resolve it explicitly for both local ADC and Cloud Run.
export const firebaseAdminProjectId = "tany-whatsapp";
const firebaseAdminAppName = "tany-messaging-admin";
const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const app =
  getApps().find((candidate) => candidate.name === firebaseAdminAppName) ??
  initializeApp(
    {
      credential: applicationDefault(),
      projectId: firebaseAdminProjectId,
    },
    firebaseAdminAppName,
  );

if (process.env.NODE_ENV === "development")
  console.info("[FIREBASE_ADMIN_DIAG]", {
    projectId: firebaseAdminProjectId,
    credentialMode: "applicationDefault",
    emulatorEnabled,
    nodeEnv: process.env.NODE_ENV,
  });

if (process.env.NODE_ENV === "development")
  console.info("[RUNTIME_PROJECT]", {
    firebaseProjectId: firebaseAdminProjectId,
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT ?? null,
    gcloudProject: process.env.GCLOUD_PROJECT ?? null,
    emulatorHostPresent: emulatorEnabled,
    pid: process.pid,
    cwd: process.cwd(),
  });

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
