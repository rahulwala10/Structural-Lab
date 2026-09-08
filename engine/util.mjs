/** Short non-cryptographic id used for load records. */
export const uid = () => Math.random().toString(36).slice(2, 9);
