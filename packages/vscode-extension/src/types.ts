/**
 * Canvas Extension Types
 */

export interface AuthConfig {
  student_id: string;
  name: string;
}

export interface SessionConfig {
  session_id: string;
  lab_id: string;
  started_at: string;
}

export interface TestResults {
  passed: boolean;
  test_name: string | null;
  error: string | null;
  output: string;
}

export interface SubmissionMetadata {
  line_count: number;
  functions_defined: string[];
}

export interface Submission {
  timestamp: string;
  file: string;
  code: string;
  test_results: TestResults;
  metadata: SubmissionMetadata;
}

export interface LabModule {
  id: string;
  title: string;
  description: string;
  path: string;
}
