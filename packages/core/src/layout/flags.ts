/**
 * Which parts of a component tree an issue is about. The 3D view tints these
 * red and shows the messages on hover. Any new rule only has to give its
 * Issue a `targets` list for its parts to be marked.
 */
import type { Issue } from '../rules';
import type { ComponentTree, Part } from './build';

/** Part id → messages of the errors that concern it. */
export function flaggedParts(tree: ComponentTree, issues: Issue[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const mark = (p: Part, msg: string) => {
    const list = out.get(p.id);
    if (list) {
      if (!list.includes(msg)) list.push(msg);
    } else out.set(p.id, [msg]);
  };
  for (const issue of issues) {
    if (issue.severity !== 'error' || issue.compartmentId !== tree.compartmentId) continue;
    for (const t of issue.targets ?? []) {
      for (const p of tree.parts) {
        const hit =
          (t.type === 'door' && 'doorId' in p && p.doorId === t.id) ||
          (t.type === 'wall' && p.kind === 'wall' && p.edgeIndex === t.edge) ||
          (t.type === 'floor' && p.kind === 'floor') ||
          (t.type === 'part' && (p.id === t.id || p.id.startsWith(`${t.id}:`)));
        if (hit) mark(p, issue.message);
      }
    }
  }
  return out;
}
