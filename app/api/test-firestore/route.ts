import { connection, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function GET() {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  await connection();
  try {
    const ref = await adminDb.collection("test").add({
      message: "Firebase Admin working",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      id: ref.id,
    });
  } catch (error) {
    console.error("Firestore test error:", error);

    return NextResponse.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}
