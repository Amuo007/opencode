import { describe, expect, test } from "bun:test"
import { NotebookTools } from "@opencode/core/tool/plugin/notebook"

const notebook = () => ({
  nbformat: 4,
  nbformat_minor: 5,
  cells: [
    { cell_type: "markdown", id: "intro", metadata: {}, source: ["# Title\n", "text"] },
    {
      cell_type: "code",
      id: "load",
      metadata: {},
      source: "x = 1\nx",
      execution_count: 3,
      outputs: [{ output_type: "execute_result", data: { "text/plain": ["1"] } }],
    },
  ],
})

describe("NotebookTools", () => {
  test("describes cells with outputs", () => {
    const text = NotebookTools.describeNotebook(notebook())
    expect(text).toContain("### Cell 0 (id: intro) [markdown]\n# Title\ntext")
    expect(text).toContain("### Cell 1 (id: load) [code]\nx = 1\nx\n--- output ---\n1")
  })

  test("replaces a cell and clears its outputs", () => {
    const result = NotebookTools.applyEdit(notebook(), { path: "n.ipynb", mode: "replace", cell_id: "load", source: "y = 2\ny" })
    expect(result.index).toBe(1)
    expect(result.notebook.cells[1]).toEqual({
      cell_type: "code",
      id: "load",
      metadata: {},
      source: ["y = 2\n", "y"],
      outputs: [],
      execution_count: null,
    })
  })

  test("inserts after a cell id or at an index", () => {
    const after = NotebookTools.applyEdit(
      notebook(),
      { path: "n.ipynb", mode: "insert", cell_id: "intro", source: "print(1)" },
      () => "new1",
    )
    expect(after.index).toBe(1)
    expect(after.notebook.cells[1]).toMatchObject({ id: "new1", cell_type: "code", source: ["print(1)"], outputs: [] })
    const first = NotebookTools.applyEdit(
      notebook(),
      { path: "n.ipynb", mode: "insert", index: 0, cell_type: "markdown", source: "hi" },
      () => "new2",
    )
    expect(first.notebook.cells[0]).toEqual({ cell_type: "markdown", id: "new2", metadata: {}, source: ["hi"] })
  })

  test("deletes and reports missing cells", () => {
    expect(NotebookTools.applyEdit(notebook(), { path: "n.ipynb", mode: "delete", index: 0 }).notebook.cells).toHaveLength(1)
    expect(() => NotebookTools.applyEdit(notebook(), { path: "n.ipynb", mode: "delete", cell_id: "nope" })).toThrow(
      "No cell with id nope",
    )
  })
})
