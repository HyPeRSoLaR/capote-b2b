export function isAgentSession(tags = []) {
  const tagList = Array.isArray(tags) ? tags : (tags?.tags || []);
  return tagList.some(t => {
    const lt = String(t).toLowerCase();
    return lt === 'agent' || lt === 'b2b-admin-agent';
  });
}
