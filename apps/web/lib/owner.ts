/** What an owner's wallet signs. Shared, so the page and the server can't disagree on the words. */
export const linkMessage = (maker: string, owner: string) => `Link ${owner.toLowerCase()} as the owner of Octane maker ${maker}.`;
