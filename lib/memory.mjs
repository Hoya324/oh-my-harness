#!/usr/bin/env node
/**
 * omh long-term memory (LTM) — programmatic access to the knowledge-graph JSONL
 * used by the `omh-memory` MCP server (@modelcontextprotocol/server-memory).
 *
 * Format-compatible with the server: each line is
 *   {"type":"entity","name":..,"entityType":..,"observations":[..]}
 *   {"type":"relation","from":..,"to":..,"relationType":..}
 *
 * Writes are ATOMIC (temp + rename) and follow the server's read-modify-write model,
 * so this helper and the MCP server can share ONE graph file for SEQUENTIAL use.
 * (Concurrency caveat: the server holds an in-memory copy and rewrites the whole file
 *  on each mutation, so a running server can clobber external appends made after its
 *  last load. Prefer agent-via-MCP writes during a live session; use this helper for
 *  hook/CLI writes when no MCP mutation is racing. Personal single-agent use is fine.)
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** Resolve the shared store path (same precedence as omh-memory.sh). */
export function memoryFile() {
  return (
    process.env.OMH_MEMORY_FILE ||
    process.env.MEMORY_FILE_PATH ||
    join(homedir(), '.omh', 'memory', 'graph.jsonl')
  );
}

/** Read the JSONL graph into { entities, relations }. Missing file → empty graph. */
export function loadGraph(file = memoryFile()) {
  const graph = { entities: [], relations: [] };
  if (!existsSync(file)) return graph;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch { continue; }
    if (o.type === 'entity') {
      graph.entities.push({ name: o.name, entityType: o.entityType, observations: o.observations || [] });
    } else if (o.type === 'relation') {
      graph.relations.push({ from: o.from, to: o.to, relationType: o.relationType });
    }
  }
  return graph;
}

/** Atomically write the graph back in server-compatible JSONL. */
export function saveGraph(graph, file = memoryFile()) {
  mkdirSync(dirname(file), { recursive: true });
  const lines = [
    ...graph.entities.map((e) =>
      JSON.stringify({ type: 'entity', name: e.name, entityType: e.entityType, observations: e.observations || [] })),
    ...graph.relations.map((r) =>
      JSON.stringify({ type: 'relation', from: r.from, to: r.to, relationType: r.relationType })),
  ];
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
  renameSync(tmp, file);
}

/** Create-or-extend an entity; observations are de-duplicated. */
export function upsertEntity(graph, { name, entityType, observations = [] }) {
  let e = graph.entities.find((x) => x.name === name);
  if (!e) { e = { name, entityType, observations: [] }; graph.entities.push(e); }
  if (entityType && !e.entityType) e.entityType = entityType;
  for (const o of observations) if (o && !e.observations.includes(o)) e.observations.push(o);
  return e;
}

/** Add a directed relation (active voice), de-duplicated. */
export function addRelation(graph, { from, to, relationType }) {
  if (!graph.relations.some((r) => r.from === from && r.to === to && r.relationType === relationType)) {
    graph.relations.push({ from, to, relationType });
  }
}

/** Substring search over name / entityType / observations. */
export function search(graph, query) {
  const q = String(query || '').toLowerCase();
  if (!q) return [];
  return graph.entities.filter((e) =>
    e.name.toLowerCase().includes(q) ||
    String(e.entityType || '').toLowerCase().includes(q) ||
    e.observations.some((o) => String(o).toLowerCase().includes(q)));
}

// ---- CLI (hook/skill use; graceful, never throws to caller shell on read) ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  const file = memoryFile();
  const g = loadGraph(file);
  const out = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
  switch (cmd) {
    case 'read': out(g); break;
    case 'search': out(search(g, rest.join(' '))); break;
    case 'stats': out(`entities=${g.entities.length} relations=${g.relations.length} file=${file}`); break;
    case 'add-observation': {
      const [name, ...txt] = rest;
      if (!name || !txt.length) { out('usage: add-observation <entity> <text...>'); break; }
      upsertEntity(g, { name, entityType: 'Project', observations: [txt.join(' ')] });
      saveGraph(g, file); out(`ok: +obs on ${name}`);
      break;
    }
    case 'add-learning': {
      const [project, ...txt] = rest;
      if (!txt.length) { out('usage: add-learning <project> <text...>'); break; }
      const slug = `learning-${Date.now()}`;
      upsertEntity(g, { name: slug, entityType: 'Learning', observations: [txt.join(' ')] });
      if (project) { upsertEntity(g, { name: project, entityType: 'Project' }); addRelation(g, { from: slug, to: project, relationType: 'about' }); }
      saveGraph(g, file); out(`ok: learning ${slug} about ${project || '(none)'}`);
      break;
    }
    default:
      out('usage: memory.mjs <read | search <q> | add-observation <entity> <text> | add-learning <project> <text> | stats>');
  }
}
