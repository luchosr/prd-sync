export type Priority = "P0" | "P1" | "P2" | "P3";

export interface Task {
  key: string; // "US-01.T2" — derived from the index
  title: string;
  done: boolean;
}

export interface UserStory {
  key: string; // "US-01"
  title: string;
  epicKey: string | null;
  body: string; // description + acceptance criteria in Markdown
  priority?: Priority;
  estimate?: number;
  tasks: Task[];
}

export interface Epic {
  key: string; // "E1"
  title: string;
  body: string;
}

export interface Prd {
  title: string;
  sourcePath: string;
  epics: Epic[];
  stories: UserStory[];
}
