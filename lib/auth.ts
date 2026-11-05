import { betterAuth } from "better-auth";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: {
        type: ["farmer", "admin"],
        required: false,
        defaultValue: "farmer",
        input: false,
      },
      preferredLanguage: {
        type: ["English", "Yoruba", "Hausa", "Igbo"],
        required: false,
        defaultValue: "English",
        input: true,
      },
    },
  },
});
