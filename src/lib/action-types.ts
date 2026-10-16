export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  redirectTo?: string;
} | null;

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
