import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPlatformKnowledgeStore } from "../server/platform-knowledge-store.mjs";

const store = createPlatformKnowledgeStore();
const [command = "summary", ...args] = process.argv.slice(2);

async function readJsonFile(filePath) {
  const resolved = path.resolve(String(filePath ?? ""));
  if (!filePath) throw new Error("This command requires a JSON input file.");
  return {
    resolved,
    value: JSON.parse(await readFile(resolved, "utf8"))
  };
}

async function run() {
  if (command === "init") return store.initialize();
  if (command === "summary") return store.getSummary();
  if (command === "review-queue") return store.getReviewQueue();
  if (command === "search") return store.search({ q: args.join(" "), limit: 25 });

  if (command === "register-source") {
    const { value } = await readJsonFile(args[0]);
    return store.registerSource(value);
  }

  if (command === "review-source") {
    const [sourceId, verifiedDecision, activeDecision, ...reviewerParts] = args;
    if (!["verified", "unverified"].includes(verifiedDecision) || !["active", "inactive"].includes(activeDecision)) {
      throw new Error("review-source requires verified|unverified and active|inactive decisions.");
    }
    return store.reviewSource(sourceId, {
      verified: verifiedDecision === "verified",
      active: activeDecision === "active",
      reviewer: reviewerParts.join(" ")
    });
  }

  if (command === "discover") {
    const { value } = await readJsonFile(args[0]);
    return store.recordDiscoveredItem(value);
  }

  if (command === "ingest") {
    const { resolved, value } = await readJsonFile(args[0]);
    if (typeof value.contentPath !== "string" || !value.contentPath.trim()) {
      throw new Error("Document ingest JSON requires contentPath.");
    }
    const contentPath = path.resolve(path.dirname(resolved), value.contentPath);
    const content = await readFile(contentPath);
    return store.ingestDocument({ ...value, content });
  }

  if (command === "propose-assertion") {
    const { value } = await readJsonFile(args[0]);
    return store.proposeAssertion(value);
  }

  if (command === "attach-text") {
    const [documentId, textFile, pageCount] = args;
    if (!documentId || !textFile) throw new Error("attach-text requires a document ID and text file path.");
    return store.attachExtractedText(documentId, {
      text: await readFile(path.resolve(textFile), "utf8"),
      pageCount: pageCount == null ? null : Number(pageCount)
    });
  }

  if (command === "review-assertion") {
    const [assertionId, decision, ...reviewerParts] = args;
    return store.reviewAssertion(assertionId, { decision, reviewer: reviewerParts.join(" ") });
  }

  if (command === "put-note") {
    const { value } = await readJsonFile(args[0]);
    return store.putNote(value);
  }

  if (command === "block-source") {
    const [sourceId, ...reasonParts] = args;
    return store.markSourceBlocked(sourceId, reasonParts.join(" "));
  }

  throw new Error(
    "Unknown command. Use init, summary, review-queue, search, register-source, review-source, discover, ingest, attach-text, propose-assertion, review-assertion, put-note, or block-source."
  );
}

try {
  console.log(JSON.stringify(await run(), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
