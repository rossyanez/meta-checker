// Shared by the server-side check and the client-side report, so this module must stay free of imports.

/** The link phase deadline. With the 10 s page budget it keeps a whole check under the 30 s the UI promises. */
export const LINK_PHASE_MS = 15_000
