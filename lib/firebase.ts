import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAbnPsZevwdtp1emL6BzVbA3kej4Jec6vs",
  authDomain: "tany-whatsapp.firebaseapp.com",
  projectId: "tany-whatsapp",
  storageBucket: "tany-whatsapp.firebasestorage.app",
  messagingSenderId: "185656276893",
  appId: "1:185656276893:web:866ef2790390559c73e174",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
