// frontend/lib/utils/auth.ts
import {jwtDecode} from "jwt-decode"; // Correct default import

interface TokenPayload {
  userId: string;
  email: string;
  role: "admin" | "student";
  isSubscribed?: boolean;
  hasPaid?: boolean;
  isMaster?: boolean;
}

export const getUserFromToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwtDecode<TokenPayload>(token);
    console.log("decoded: " + JSON.stringify(decoded));
    
    return decoded;
  } catch (err) {
    console.error("Invalid token:", err);
    return null;
  }
};