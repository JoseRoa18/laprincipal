# Claude Surface Playbook

Use this when the skill is running in Claude Desktop, Claude chat, or another Claude surface where uploaded files and images are available directly in the conversation.

## Default Assumptions

- Uploaded images, screenshots, and PDFs can be inspected directly by Claude.
- Uploaded PDFs should usually be read natively by Claude before reaching for helper scripts.
- Code execution may or may not be available.
- File-system paths and local shell commands may not be available.

## Best Working Mode

1. Read the uploaded problem natively in the chat first.
2. Transcribe the task into a clean mathematical statement.
3. Solve from the clean statement.
4. Verify with reasoning first.
5. Use scripts only as an optional extra when the surface supports them.

## When Images Are Messy

- Ask for a tighter crop if the page contains several problems.
- Ask for a brighter or flatter photo if exponents, denominators, or labels are unclear.
- If the image includes a diagram, restate the marked givens before solving.
- For PDFs, prefer direct page reading and only convert to images outside the skill if the rendered page is genuinely unreadable.

## When Code Execution Is Unavailable

- Do not say the skill cannot work.
- Fall back to:
  - explicit transcription
  - assumption listing
  - symbolic reasoning
  - manual substitution and sanity checks
  - visual interpretation directly from the uploaded image

## Response Shape For Claude Chat

Prefer this order:

1. interpreted problem statement
2. short problem map
3. step-by-step solution
4. verification or uncertainty note

If there were ambiguities in the uploaded source, surface them early rather than burying them at the end.
