export function generateSnippet(url: string): string {
  return `fetch("${url}/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "LABEL_HERE", data: {YOUR_DATA}})
})`;
}
