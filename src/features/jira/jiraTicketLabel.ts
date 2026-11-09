const jiraTicketValueKeys: Record<string, string> = {
  QA: 'jira.value.qa',
  'To Do': 'jira.value.toDo',
  'In Progress': 'jira.value.inProgress',
  Done: 'jira.value.done',
  Highest: 'jira.value.highest',
  High: 'jira.value.high',
  Medium: 'jira.value.medium',
  Low: 'jira.value.low',
  None: 'jira.value.none',
  Task: 'jira.value.task',
  Story: 'jira.value.story',
  Bug: 'jira.value.bug',
  Subtask: 'jira.value.subtask',
}

export function jiraTicketValueKey(value: string) {
  return jiraTicketValueKeys[value] ?? value
}
