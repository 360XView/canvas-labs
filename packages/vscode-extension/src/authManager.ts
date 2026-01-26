import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { AuthConfig } from "./types";

/**
 * Manages Canvas student authentication
 * Stores/retrieves student ID from ~/.canvas/auth.json
 */
export class AuthManager {
  private authPath = path.join(
    process.env.HOME || process.env.USERPROFILE || "~",
    ".canvas",
    "auth.json"
  );

  isAuthenticated(): boolean {
    return fs.existsSync(this.authPath);
  }

  async promptForAuth(): Promise<boolean> {
    const studentId = await vscode.window.showInputBox({
      prompt: "Enter your student ID (e.g., alice)",
      placeHolder: "student-id",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Student ID cannot be empty";
        }
        return null;
      },
    });

    if (!studentId) {
      return false;
    }

    try {
      const authDir = path.dirname(this.authPath);
      fs.mkdirSync(authDir, { recursive: true });

      const auth: AuthConfig = {
        student_id: studentId,
        name: studentId,
      };

      fs.writeFileSync(this.authPath, JSON.stringify(auth, null, 2));
      vscode.window.showInformationMessage(
        `Canvas authenticated as: ${studentId}`
      );
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to save authentication: ${error}`
      );
      return false;
    }
  }

  getStudentId(): string | null {
    try {
      const content = fs.readFileSync(this.authPath, "utf-8");
      const auth: AuthConfig = JSON.parse(content);
      return auth.student_id;
    } catch {
      return null;
    }
  }

  getAuthConfig(): AuthConfig | null {
    try {
      const content = fs.readFileSync(this.authPath, "utf-8");
      return JSON.parse(content) as AuthConfig;
    } catch {
      return null;
    }
  }
}
