export default function Home() {
  return (
    <main>
      <h1>Meta Checker</h1>
      <label htmlFor="url">Page URL</label>
      <input id="url" name="url" type="url" placeholder="https://example.com" />
      <button type="button">Check</button>
    </main>
  )
}
