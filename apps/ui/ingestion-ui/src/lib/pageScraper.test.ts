import { describe, expect, it } from "vitest";
import { convertHtmlToMarkdown } from "./pageScraper";

const BASE = "https://docs.example.com/education/student/overview";
const filler = "Nội dung giải thích chi tiết cho học viên. ".repeat(6);

describe("convertHtmlToMarkdown", () => {
  it("giữ toàn bộ nội dung khi vùng chính có div lồng nhau", () => {
    const html = `<html><body>
      <nav><a href="/a">Menu 1</a></nav>
      <div id="wiki-content">
        <h1>Student</h1>
        <div class="intro"><p>${filler}</p></div>
        <div class="section"><h2>Enrollment</h2><p>Phần cuối của bài viết.</p></div>
      </div>
      <footer>Copyright</footer>
    </body></html>`;
    const md = convertHtmlToMarkdown(html, BASE);
    expect(md).toContain("# Student");
    expect(md).toContain("## Enrollment");
    expect(md).toContain("Phần cuối của bài viết.");
    expect(md).not.toContain("Menu 1");
    expect(md).not.toContain("Copyright");
  });

  it("chuyển bảng thành bảng Markdown", () => {
    const html = `<article><p>${filler}</p><table>
      <thead><tr><th>Field</th><th>Mô tả</th></tr></thead>
      <tbody><tr><td>Student Name</td><td>Tên học viên</td></tr></tbody>
    </table></article>`;
    const md = convertHtmlToMarkdown(html, BASE);
    expect(md).toMatch(/\| Field \| Mô tả \|/);
    expect(md).toMatch(/\| Student Name \| Tên học viên \|/);
  });

  it("giải mã entity và phân giải link/ảnh tương đối", () => {
    const html = `<main><p>${filler}</p><p>It&#8217;s &amp; ok</p>
      <a href="../program">Program</a> <img src="img/a.png" alt="Sơ đồ"></main>`;
    const md = convertHtmlToMarkdown(html, BASE);
    expect(md).toContain("It’s & ok");
    expect(md).toContain("[Program](https://docs.example.com/education/program)");
    expect(md).toContain("![Sơ đồ](https://docs.example.com/education/student/img/a.png)");
  });

  it("giữ ngôn ngữ của khối code", () => {
    const html = `<article><p>${filler}</p><pre><code class="language-python">print("hi")</code></pre></article>`;
    expect(convertHtmlToMarkdown(html, BASE)).toContain('```python\nprint("hi")\n```');
  });

  it("loại bỏ chuỗi data:image base64 khổng lồ để tránh làm phình markdown", () => {
    const hugeBase64 = "data:image/png;base64," + "A".repeat(10000);
    const html = `<article><p>${filler}</p><img src="${hugeBase64}" alt="Ảnh chụp màn hình"></article>`;
    const md = convertHtmlToMarkdown(html, BASE);
    expect(md).not.toContain("data:image/png;base64");
    expect(md.length).toBeLessThan(1000);
  });
});
