Please analyze the following Jira Ticket and propose an implementation plan based on the current project and branch:

[%ticket content%]

Please check the existing codebase first, then break down the tasks into frontend (FE) and backend (BE) work orders and save them in the /spec/job directory.

File name format: YYYYMMDD_HHmmss_{Jira Ticket ID}_{FE or BE}.md For example: 20261105_230524_ABC-1234_FE.md

Both work orders must follow a consistent format, including:

Basic Information: Jira Ticket, Work Type, Current Project & Branch, Created Time.

Requirements & Task Breakdown: Grouped by feature or module, with each independently executable task using a Markdown checkbox (- [ ]).

Estimated List of File Changes: List relevant files and expected modifications.

Acceptance Criteria: Each independently verifiable condition must use a Markdown checkbox (- [ ]).

Testing Methods: List recommended tests and checks to perform.

All checkboxes must be unchecked initially; mark any unconfirmed items as "TBD" (To Be Determined).

If dispatching is not needed, do not export work orders; simply provide a summary explaining why dispatching is unnecessary upon completion.

[Completion Summary Rules (CRITICAL: Strictly under 120 characters)]
- In your final response, output ONLY a concise summary stating the "FE / BE core change points (or reason why no dispatch is needed)" and the "exported work order filename(s) (basename only, e.g., `20261105_230524_ABC-1234_FE.md`)".
- DO NOT include conversational filler or preamble (e.g., "I have completed the codebase check and task analysis..."), process narration, Markdown headings (`#`), horizontal rules (`---`), or full-length reports.
- DO NOT use `file:///` links or full directory paths; always use filenames (basenames) only so the summary fits cleanly within the 150-character limit.
