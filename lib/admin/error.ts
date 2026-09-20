/** Its own module so the code module and the auth module can both raise it without importing each other. */
export class AdminError extends Error { constructor(public status: number, public code: string) { super(code); } }
