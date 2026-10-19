export class ToolRegistryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ToolRegistryError";
    this.code = code;
    this.details = details;
  }
}

export function createToolRegistry() {
  const tools = new Map();

  function register(name, handler, meta = {}) {
    if (!name || typeof name !== "string") {
      throw new ToolRegistryError("invalid_tool_name", "Tool registration requires a non-empty string name.");
    }
    if (typeof handler !== "function") {
      throw new ToolRegistryError("invalid_tool_handler", `Tool ${name} requires a function handler.`, { tool: name });
    }
    if (tools.has(name)) {
      throw new ToolRegistryError("duplicate_tool_registration", `Tool ${name} is already registered.`, { tool: name });
    }
    tools.set(name, {
      name,
      handler,
      meta: Object.freeze({ ...meta })
    });
    return name;
  }

  function dispatch(name, args = {}, context = {}) {
    const registered = tools.get(name);
    if (!registered) {
      return {
        handled: true,
        tool: typeof name === "string" && name ? name : "unknown_tool",
        safeRefusal: true,
        truthState: "plan_rejected",
        error: {
          code: "unknown_tool",
          message: "The requested analysis tool is not registered."
        },
        text: "I could not run that analysis because its tool is not registered.",
        actions: []
      };
    }
    return registered.handler(args, context);
  }

  function list() {
    return [...tools.values()].map(({ name, meta }) => ({ name, meta }));
  }

  return Object.freeze({ register, dispatch, list });
}
