import { FieldValue, type DocumentReference, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { isTanyVertical } from "@/lib/messaging/vertical-config";
import type { TanyVertical } from "@/lib/messaging/types";

export const serverTimestamp = () => FieldValue.serverTimestamp();

export function documentId(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || value === "." || value === ".." || /^__.*__$/.test(value) || Buffer.byteLength(value, "utf8") > 1500) {
    throw new Error("Invalid Firestore document ID");
  }
  return value;
}

export function customerDocumentId(businessId: string, phone: string): string {
  documentId(businessId);
  documentId(phone);
  return documentId(`${businessId}_${phone}`);
}

export function assertVertical(vertical: TanyVertical) {
  if (!isTanyVertical(vertical)) throw new Error("Unsupported Tany vertical");
}

export function money(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) {
    throw new Error("Amount must be a finite non-negative INR value");
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function definedFields<T extends object>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T;
}

export async function readDocument<T>(ref: DocumentReference): Promise<T | null> {
  const snapshot = await ref.get();
  return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } as T : null;
}

/** Read/modify/write atomically, so unrelated concurrent updates are preserved. */
export async function mutateDocument<T extends { id: string }>(
  ref: DocumentReference,
  mutate: (current: T) => Partial<Omit<T, "id">>,
  beforeWrite?: (transaction: FirebaseFirestore.Transaction, current: T, updated: T) => Promise<void>
): Promise<T> {
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error(`Document not found: ${ref.path}`);
    const current = { ...snapshot.data(), id: snapshot.id } as T;
    const changes = definedFields({ ...mutate(current), updatedAt: serverTimestamp() });
    if (beforeWrite) await beforeWrite(transaction, current, { ...current, ...changes });
    transaction.update(ref, changes as DocumentData);
    return { ...current, ...changes } as T;
  });
}
