/** What a Server Action returns when the interface should show a message. */
export type Failure = { ok: false; error: string };

/** The result of a Server Action that has nothing to report but success. */
export type ActionResult = { ok: true } | Failure;
