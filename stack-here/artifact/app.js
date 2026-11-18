(function () {
  "use strict";
  var TOOLS = SH.TOOLS;
  var byId = new Map(TOOLS.map(function (t) { return [t.id, t]; }));
  var matcher = SH.createMatcher(TOOLS);
  var GRADE_BG = { A: "#16A34A", B: "#65A30D", C: "#CA8A04", D: "#EA580C", F: "#DC2626" };
  var CUT_REASONS = {
    overlap: "Another tool already did the job",
    cost: "Too expensive for what we got",
    unused: "Nobody was using it",
    quality: "Data or output quality was poor",
    replaced: "Replaced by a different tool",
    other: "Something else",
  };
  var EXAMPLE = SH.SAMPLES[3];
  var view = document.getElementById("view");

  // ---- helpers ----
  function h(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function name(id) { var t = byId.get(id); return t ? t.name : id; }
  function toolTag(id) {
    var t = byId.get(id);
    if (!t) return "";
    var c = SH.categoryOf(t.category);
    return '<span class="tag" style="background:' + c.bg + ";color:" + c.fg + '">' + h(t.name) + "</span>";
  }
  function catTag(cat) {
    var c = SH.categoryOf(cat);
    return '<span class="tag" style="background:' + c.bg + ";color:" + c.fg + '">' + h(c.label) + "</span>";
  }
  function priceLabel(t) {
    var p = t.pricing;
    if (p.status === "not_public") return "pricing not public";
    if (p.status === "unverified") return "pricing not verified";
    if (p.amount == null) return p.note || "no fixed price";
    if (p.amount === 0) return "usage-based, starts at $0";
    var sym = p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : (p.currency || "") + " ";
    return sym + p.amount + (p.unit === "seat/month" ? "/seat/mo" : p.unit === "month" ? "/mo" : "") + (p.plan ? " (" + p.plan + ")" : "");
  }
  function priceCell(t) {
    var label = h(priceLabel(t));
    return t.pricing.sourceUrl ? '<a href="' + h(t.pricing.sourceUrl) + '" target="_blank" rel="noreferrer">' + label + "</a>" : label;
  }
  function safeUnknown(raw) {
    var n = String(raw).toLowerCase().trim();
    if (n.length < 2 || n.length > 30) return null;
    if (/[@:/\\]|\d{4,}|https?|www\./.test(n)) return null;
    if (n.split(/\s+/).length > 3) return null;
    return n;
  }

  // ---- shared store (anonymized submissions and cut reports) ----
  var store = { db: null, status: "loading", subs: [], cuts: [], learned: null, canWrite: true };
  function recompute() {
    store.learned = SH.computeLearnedRules(store.subs, store.cuts, TOOLS);
    if (route().view === "insights") render();
    else if (route().view === "result") {
      var el = document.getElementById("kicker");
      if (el && current) el.textContent = kickerText(current);
    }
  }
  function toSub(d) {
    var x = d.data() || {};
    return {
      id: d.id,
      tools: Array.isArray(x.tools) ? x.tools : [],
      teamSize: x.teamSize || null,
      score: Number(x.score) || 0,
      grade: String(x.grade || ""),
      result: { overlaps: Array.isArray(x.overlaps) ? x.overlaps : [] },
      unknown: Array.isArray(x.unknown) ? x.unknown : [],
      createdAt: String(x.createdAt || ""),
    };
  }
  function toCut(d) {
    var x = d.data() || {};
    return { id: d.id, toolId: String(x.toolId || ""), reason: String(x.reason || ""), replacedBy: x.replacedBy || null, note: x.note || null, createdAt: String(x.createdAt || "") };
  }
  function connect() {
    if (!window.claude || !window.claude.use) { store.status = "off"; return; }
    window.claude.use("db").then(function (db) {
      if (!db) { store.status = "off"; if (route().view !== "home") render(); return; }
      store.db = db;
      var got = 0;
      var timer = setTimeout(function () { if (store.status === "loading") { store.status = "slow"; if (route().view === "insights") render(); } }, 10000);
      function ok(snap) {
        if (!snap.metadata.fromCache) { got++; if (got >= 2) { clearTimeout(timer); store.status = "ready"; } }
        recompute();
      }
      function fail() { clearTimeout(timer); store.status = "off"; if (route().view === "insights") render(); }
      db.collection("submissions").orderBy("createdAt", "desc").limit(1000).onSnapshot(function (s) { store.subs = s.docs.map(toSub); ok(s); }, fail);
      db.collection("cuts").orderBy("createdAt", "desc").limit(1000).onSnapshot(function (s) { store.cuts = s.docs.map(toCut); ok(s); }, fail);
    });
  }
  function write(collection, doc) {
    if (!store.db || !store.canWrite) return Promise.resolve(false);
    return store.db.collection(collection).add(doc).then(function () { return true; }, function (e) {
      if (e && e.code === "invalid_argument") store.canWrite = false;
      return false;
    });
  }

  // ---- routing: the whole result lives in the link, so every result has its own URL ----
  var current = null; // { hash, result }
  function encode(r) {
    var parts = r.tools.map(function (id) {
      var i = TOOLS.findIndex(function (t) { return t.id === id; });
      var seats = r.seats && r.seats[id];
      return ("0" + i.toString(36)).slice(-2) + (seats ? seats.toString(36) : "");
    });
    return "s-" + (r.teamSize ? r.teamSize.toString(36) : "0") + "-" + parts.join("-");
  }
  function decode(hash) {
    var parts = hash.split("-");
    if (parts[0] !== "s" || parts.length < 3) return null;
    var team = parseInt(parts[1], 36) || null;
    var ids = [], seats = {};
    for (var i = 2; i < parts.length; i++) {
      var t = TOOLS[parseInt(parts[i].slice(0, 2), 36)];
      if (!t) continue;
      ids.push(t.id);
      if (parts[i].length > 2) { var s = parseInt(parts[i].slice(2), 36); if (s > 0) seats[t.id] = s; }
    }
    return ids.length ? { toolIds: ids, teamSize: team, seats: seats, unknown: [] } : null;
  }
  function route() {
    var hash = location.hash.replace(/^#/, "");
    if (hash === "tools" || hash === "insights") return { view: hash };
    if (/^s-/.test(hash)) return { view: "result", hash: hash };
    return { view: "home" };
  }
  function grade(text, teamSize, isSample) {
    var parsed = matcher.parse(text);
    if (!parsed.matched.length) return false;
    var seats = {};
    parsed.matched.forEach(function (m) { if (m.seats) seats[m.toolId] = m.seats; });
    var input = { toolIds: parsed.matched.map(function (m) { return m.toolId; }), unknown: parsed.unknown, teamSize: teamSize || null, seats: seats };
    var result = SH.analyze(input, { tools: TOOLS, learned: store.learned });
    var hash = encode(result);
    current = { hash: hash, result: result };
    if (!isSample) {
      var unknown = [];
      new Set(result.unknown).forEach(function (u) { var n = safeUnknown(u); if (n) unknown.push(n); });
      write("submissions", {
        tools: result.tools.slice().sort(),
        teamSize: result.teamSize,
        score: result.score,
        grade: result.grade,
        overlaps: result.overlaps.map(function (o) { return { job: o.job, severity: o.severity, tools: o.tools }; }),
        unknown: unknown,
        createdAt: new Date().toISOString(),
      });
    }
    if (location.hash === "#" + hash) render(); else location.hash = hash;
    return true;
  }

  // ---- views ----
  function homeView() {
    return '<section class="hero"><h1>Grade your GTM stack.</h1>' +
      "<p>Paste the tools your team pays for. You get a grade, the tools doing the same job, a rough number for what the duplicates cost, and what is missing.</p></section>" +
      '<section><form class="form" id="stack-form">' +
      '<div><label for="stack-text">Your tools, separated by commas or new lines</label>' +
      '<textarea id="stack-text" spellcheck="false">' + h(EXAMPLE.text) + "</textarea></div>" +
      '<p class="note" id="example-note">Example stack loaded. Replace it with yours, or add seats like "Gong x10".</p>' +
      '<div class="row"><div class="team"><label for="team-size">Team size</label>' +
      '<input id="team-size" type="number" min="1" max="5000" inputmode="numeric" value="' + EXAMPLE.teamSize + '"></div>' +
      '<button class="btn" type="submit">Grade my stack</button></div>' +
      '<p class="err" id="form-err" hidden></p></form></section>' +
      '<section><p class="label">Or try a sample stack</p><div class="chips">' +
      SH.SAMPLES.map(function (s, i) { return '<button class="chip" type="button" data-sample="' + i + '">' + h(s.label) + "</button>"; }).join("") +
      "</div></section>" +
      '<p class="note">' + TOOLS.length + " tools in the database. Only the tool names and team size are stored, never who you are.</p>";
  }

  function kickerText(r) {
    var pct = SH.percentile(r.score, store.learned);
    return "Stack grade · " + r.score + "/100" + (pct != null ? " · beats " + pct + "% of stacks" : "");
  }

  function resultView(r) {
    var tools = r.tools.map(function (id) { return byId.get(id); }).filter(Boolean);
    var direct = r.overlaps.filter(function (o) { return o.severity === "direct"; });
    var partial = r.overlaps.filter(function (o) { return o.severity === "partial"; });
    var out = "";

    out += '<section class="grade"><div class="letter" style="background:' + GRADE_BG[r.grade] + '" aria-label="Grade ' + r.grade + '">' + r.grade + "</div>" +
      '<div><p class="kicker" id="kicker">' + h(kickerText(r)) + '</p><p class="roast">' + h(r.roast) + '</p><ul class="why">' +
      r.explanation.map(function (l) { return "<li><span>" + h(l) + "</span></li>"; }).join("") + "</ul></div></section>";

    out += '<section><div class="tags">' + tools.map(function (t) { return toolTag(t.id); }).join("") + "</div>" +
      '<p class="note" style="margin-top:10px">' + tools.length + " tool" + (tools.length === 1 ? "" : "s") + " recognized" +
      (r.teamSize ? " · team of " + r.teamSize : " · no team size given, assuming " + SH.DEFAULT_SEATS + " seats") +
      (r.unknown.length ? " · not recognized (ignored): " + h(r.unknown.join(", ")) : "") + "</p></section>";

    out += "<section><h2>Overlaps</h2>";
    if (!r.overlaps.length) out += "<p>None. Every tool has its own job.</p>";
    out += '<div class="stack">' + direct.concat(partial).map(function (o) {
      return '<div class="box"><div class="head"><h3>' + h(o.jobLabel) + '</h3><span class="pill' + (o.severity === "direct" ? " solid" : "") + '">' +
        (o.severity === "direct" ? "Direct overlap" : "Partial overlap") + "</span></div><p>" + h(o.advice) + '</p><div class="grid2" style="margin-top:14px">' +
        o.tools.map(function (x) {
          var t = byId.get(x.id);
          if (!t) return "";
          return '<div class="cell"><div class="tags">' + toolTag(t.id) + (x.primary ? "" : '<span class="note">side feature</span>') + "</div><b>Best at:</b> " + h(t.bestAt) + "<small>" + h(priceLabel(t)) + "</small></div>";
        }).join("") + "</div></div>";
    }).join("") + "</div></section>";

    out += '<section><h2>Wasted spend</h2><div class="waste"><span class="est">Estimate, not an audit</span><div class="num">' +
      (r.waste.high > 0 ? money(r.waste.low) + " to " + money(r.waste.high) + " <span>/ year</span>" : direct.length ? "Can't price it" : "$0") + "</div><p>" +
      (r.waste.high > 0 ? "What duplicate tools cost at public list prices."
        : direct.length ? "There are direct overlaps, but none of the duplicate tools publish a price we could use."
        : "No two tools in this stack are bought for the same main job.") + "</p></div>";
    if (r.waste.items.length) {
      out += '<div class="scroll" style="margin-top:16px"><table><thead><tr><th>Duplicate tool</th><th>How it was counted</th><th class="n">Per year</th></tr></thead><tbody>' +
        r.waste.items.map(function (i) {
          var t = byId.get(i.toolId);
          return "<tr><td><b>" + h(name(i.toolId)) + "</b></td><td>" + h(i.basis) +
            (t && t.pricing.sourceUrl ? ' · <a href="' + h(t.pricing.sourceUrl) + '" target="_blank" rel="noreferrer">source</a>' : "") +
            '</td><td class="n"><b>' + money(i.annual) + "</b></td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    if (r.waste.excluded.length) {
      out += '<p style="margin-top:14px;font-size:14px"><b>Not counted:</b> ' +
        h(r.waste.excluded.map(function (e) { return name(e.toolId) + " (" + e.reason + ")"; }).join(", ")) + ".</p>";
    }
    out += '<ul class="fine">' + r.waste.assumptions.map(function (a) { return "<li>" + h(a) + "</li>"; }).join("") +
      "<li>For scale: the " + r.knownSpend.pricedTools + " tool" + (r.knownSpend.pricedTools === 1 ? "" : "s") +
      " here with a usable public price come to about " + money(r.knownSpend.annual) + " a year at entry-plan list prices" +
      (r.knownSpend.unpricedTools > 0 ? "; " + r.knownSpend.unpricedTools + " more have no public price" : "") + ".</li></ul></section>";

    out += "<section><h2>Gaps</h2>";
    if (!r.gaps.length) out += "<p>None for a team this size.</p>";
    out += '<div class="grid2">' + r.gaps.map(function (g) {
      return '<div class="box gap"><div class="head"><h3>' + h(g.label) + "</h3>" + (g.tier === "core" ? '<span class="pill core">Core</span>' : "") + "</div><p>" + h(g.why) + "</p>" +
        (g.examples.length ? '<div class="tags" style="margin-top:12px"><span class="note">Tools that do this:</span>' + g.examples.map(toolTag).join("") + "</div>" : "") + "</div>";
    }).join("") + "</div></section>";

    out += '<section><h2>Share it</h2><canvas class="card" id="card" width="1200" height="630" role="img" aria-label="Share card: grade ' + r.grade + ". " + h(r.roast) + '"></canvas>' +
      '<div class="share"><button class="btn ghost" type="button" id="save-card" hidden>Save card as PNG</button>' +
      '<span class="note" id="share-note">This result has its own link. Use Share, then Copy link, while this result is open.</span></div></section>';

    out += '<section><h2>Your tools</h2><div class="scroll"><table class="wide"><thead><tr><th>Tool</th><th>Category</th><th>Best at</th><th>List price</th></tr></thead><tbody>' +
      tools.map(function (t) {
        return "<tr><td><b>" + h(t.name) + "</b></td><td>" + catTag(t.category) + "</td><td>" + h(t.bestAt) + "</td><td>" + priceCell(t) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";

    var all = TOOLS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var opt = function (t) { return '<option value="' + h(t.id) + '">' + h(t.name) + "</option>"; };
    out += '<section class="panel"><h2>Cut a tool lately?</h2><p>Tell us what you dropped and why. It is anonymous, and it is how the grades get better.</p>';
    if (store.status === "off") out += '<p class="note" style="margin-top:12px">Cut reports can be saved only when you are signed in.</p>';
    else out += '<form id="cut-form">' +
      '<div><label for="cut-tool">Tool you cut</label><select id="cut-tool" required><option value="">Choose a tool</option><optgroup label="In this stack">' +
      tools.map(opt).join("") + '</optgroup><optgroup label="All tools">' + all.map(opt).join("") + "</optgroup></select></div>" +
      '<div><label for="cut-reason">Why</label><select id="cut-reason">' +
      Object.keys(CUT_REASONS).map(function (k) { return '<option value="' + k + '">' + h(CUT_REASONS[k]) + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="cut-repl">Replaced by (optional)</label><select id="cut-repl"><option value="">Nothing</option>' + all.map(opt).join("") + "</select></div>" +
      '<div><label for="cut-note">Note (optional)</label><input id="cut-note" maxlength="280" placeholder="What happened?"></div>' +
      '<div><button class="btn ghost" type="submit">I cut this tool</button></div><p class="note" id="cut-msg" role="status"></p></form>';
    out += "</section>";

    out += '<p><a class="back" href="#home">Grade another stack</a></p>';
    return out;
  }

  function toolsView() {
    var pub = TOOLS.filter(function (t) { return t.pricing.status === "public"; }).length;
    return '<section class="hero"><h1>' + TOOLS.length + " tools.</h1><p>" + pub + " have a public list price with a source link. The rest say so. No price here is a guess.</p></section>" +
      '<section><label for="tool-filter">Filter by name or category</label><input id="tool-filter" type="search" placeholder="e.g. enrichment">' +
      '<div class="scroll" style="margin-top:16px"><table class="wide"><thead><tr><th>Tool</th><th>Category</th><th>Best at</th><th>List price</th></tr></thead><tbody id="tool-rows">' +
      TOOLS.map(function (t) {
        var c = SH.categoryOf(t.category);
        return '<tr data-k="' + h((t.name + " " + c.label + " " + t.aliases.join(" ")).toLowerCase()) + '"><td><b>' + h(t.name) + "</b></td><td>" + catTag(t.category) + "</td><td>" + h(t.bestAt) + "</td><td>" + priceCell(t) + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }

  function tbl(head, rows) {
    return '<div class="scroll"><table><thead><tr>' + head.map(function (x, i) { return "<th" + (i === head.length - 1 ? ' class="n"' : "") + ">" + x + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.map(function (r) {
        return "<tr>" + r.map(function (c, i) { return "<td" + (i === r.length - 1 ? ' class="n"' : "") + ">" + c + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  function insightsView() {
    var out = '<section class="hero"><h1>Insights.</h1><p>What people submit and what they cut. Grades and overlap rules are recomputed from this data every time the page loads.</p></section>';
    if (store.status === "off") return out + '<div class="empty">Stored submissions cannot be read in this view. Sign in to see them.</div>';
    if (store.status === "loading") return out + '<div class="empty">Loading stored submissions.</div>';
    if (store.status === "slow" && !store.subs.length) return out + '<div class="empty">The stored submissions cannot be reached yet. This page will fill in when they arrive.</div>';
    if (!store.subs.length && !store.cuts.length) {
      return out + '<div class="empty"><b>No submissions yet.</b> Grade a stack of your own on the Grade tab and it shows up here: most common stacks, most-cut tools and the overlaps that come up most. Sample stacks are not stored.</div>';
    }
    var ins = SH.computeInsights(store.subs, store.cuts, TOOLS);
    var L = store.learned;
    var total = ins.totals.submissions || 1;
    out += '<section class="stats"><div class="stat"><b>' + ins.totals.submissions + "</b><span>Stacks graded</span></div>" +
      '<div class="stat"><b>' + (ins.totals.avgScore == null ? "n/a" : ins.totals.avgScore) + "</b><span>Average score</span></div>" +
      '<div class="stat"><b>' + ins.totals.cuts + "</b><span>Cut reports</span></div></section>";
    out += '<section><h2>Grades</h2><div class="bars">' + ["A", "B", "C", "D", "F"].map(function (g) {
      var n = ins.grades[g] || 0;
      return '<div class="bar"><span>' + g + '</span><div><i style="width:' + (n / total) * 100 + "%;background:" + GRADE_BG[g] + '"></i></div><em>' + n + "</em></div>";
    }).join("") + "</div></section>";
    out += "<section><h2>Most common stacks</h2>" + (ins.topStacks.length
      ? tbl(["Stack", "Count"], ins.topStacks.map(function (s) { return ['<div class="tags">' + s.tools.map(toolTag).join("") + "</div>", s.count]; }))
      : "<p>No stack with two or more tools yet.</p>") + "</section>";
    out += "<section><h2>Most common tools</h2>" + tbl(["Tool", "Share of stacks", "Count"], ins.topTools.map(function (t) {
      return [toolTag(t.id), Math.round((t.count / total) * 100) + "%", t.count];
    })) + "</section>";
    out += "<section><h2>Most frequent overlaps</h2>" + (ins.topOverlaps.length
      ? tbl(["Job", "Tools", "Count"], ins.topOverlaps.map(function (o) { return ["<b>" + h(SH.jobLabel(o.job)) + "</b>", '<div class="tags">' + o.tools.map(toolTag).join("") + "</div>", o.count]; }))
      : "<p>No direct overlaps recorded yet.</p>") + "</section>";
    out += "<section><h2>Most-cut tools</h2>" + (ins.mostCut.length
      ? tbl(["Tool", "Top reason", "Seen in stacks", "Cuts"], ins.mostCut.map(function (c) {
          var top = Object.keys(c.reasons).sort(function (a, b) { return c.reasons[b] - c.reasons[a]; })[0];
          return [toolTag(c.id) || h(c.id), h(CUT_REASONS[top] || top), c.seen, c.count];
        }))
      : "<p>No cut reports yet. They come from the form at the bottom of every result.</p>") + "</section>";
    if (ins.replacements.length) {
      out += "<section><h2>Replacements</h2>" + tbl(["Cut", "Replaced by", "Count"], ins.replacements.map(function (r) { return [toolTag(r.from), toolTag(r.to), r.count]; })) + "</section>";
    }
    var unk = new Map();
    store.subs.forEach(function (s) { s.unknown.forEach(function (u) { unk.set(u, (unk.get(u) || 0) + 1); }); });
    if (unk.size) {
      var rows = Array.from(unk.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 20);
      out += "<section><h2>Names not in the database</h2>" + tbl(["Name typed", "Count"], rows.map(function (r) { return [h(r[0]), r[1]]; })) + "</section>";
    }
    var jw = Object.keys(L.jobWeight), cp = Object.keys(L.toolCutPenalty);
    out += "<section><h2>Learned rules</h2>";
    if (!jw.length && !cp.length) {
      out += "<p>Nothing adjusted yet. Overlap weights move after " + SH.MIN_CUTS_FOR_JOB_WEIGHTS + " overlap cuts; a tool is penalized after " +
        SH.MIN_CUTS_PER_TOOL + " cuts across at least " + SH.MIN_APPEARANCES_PER_TOOL + " stacks. Small samples do not move grades.</p>";
    } else {
      if (jw.length) out += tbl(["Job", "Overlap penalty multiplier"], jw.map(function (j) { return [h(SH.jobLabel(j)), "×" + L.jobWeight[j]]; }));
      if (cp.length) out += '<div style="margin-top:16px">' + tbl(["Tool", "Score penalty"], cp.map(function (id) { return [toolTag(id), "-" + L.toolCutPenalty[id]]; })) + "</div>";
    }
    out += '<p class="note" style="margin-top:12px">' + (L.scores.length >= 30 ? "Results show a percentile against " + L.scores.length + " stored scores." : "Results show a percentile once 30 stacks are stored (" + L.scores.length + " so far).") + "</p></section>";
    return out;
  }

  // ---- share card (1200x630 canvas) ----
  function wrapLines(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      var t = line ? line + " " + w : w;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  function pill(ctx, x, y, w, hgt) { ctx.beginPath(); ctx.roundRect(x, y, w, hgt, hgt / 2); }
  function drawCard(canvas, r) {
    var ctx = canvas.getContext("2d");
    var F = '"Inter", system-ui, sans-serif', P = 56, W = 1200, H = 630;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    // footer
    var lineY = 504;
    ctx.fillStyle = "#000"; ctx.fillRect(P, lineY, W - 2 * P, 3);
    ctx.font = "900 40px " + F; ctx.textAlign = "left"; ctx.fillText("stack.here", P, 568);
    ctx.font = "500 24px " + F; ctx.fillStyle = "#737373"; ctx.textAlign = "right";
    ctx.fillText(r.waste.high > 0 ? "Est. " + money(r.waste.low) + " to " + money(r.waste.high) + "/yr in duplicate tools" : "Grade your GTM stack", W - P, 566);
    ctx.textAlign = "left";
    // tool pills, laid out bottom-up
    var tools = r.tools.map(function (id) { return byId.get(id); }).filter(Boolean);
    var shown = tools.slice(0, 8), extra = tools.length - shown.length;
    ctx.font = "700 26px " + F;
    var items = shown.map(function (t) {
      var label = t.name.length > 22 ? t.name.slice(0, 21) + "…" : t.name, c = SH.categoryOf(t.category);
      return { label: label, bg: c.bg, fg: c.fg, w: ctx.measureText(label).width + 44 };
    });
    if (extra > 0) items.push({ label: "+" + extra + " more", outline: true, w: ctx.measureText("+" + extra + " more").width + 44 });
    var rows = [[]], x = 0;
    items.forEach(function (it) {
      if (x + it.w > W - 2 * P && rows[rows.length - 1].length) { rows.push([]); x = 0; }
      rows[rows.length - 1].push(it); x += it.w + 12;
    });
    var PH = 52, top = lineY - 28 - rows.length * PH - (rows.length - 1) * 12;
    rows.forEach(function (row, i) {
      var px = P, py = top + i * (PH + 12);
      row.forEach(function (it) {
        pill(ctx, px, py, it.w, PH);
        if (it.outline) { ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = "#000"; }
        else { ctx.fillStyle = it.bg; ctx.fill(); ctx.fillStyle = it.fg; }
        ctx.fillText(it.label, px + 22, py + 36);
        px += it.w + 12;
      });
    });
    // grade block
    var box = Math.max(160, Math.min(300, top - 20 - P));
    ctx.fillStyle = GRADE_BG[r.grade] || "#000";
    ctx.beginPath(); ctx.roundRect(P, P, box, box, box * 0.133); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "900 " + Math.round(box * 0.83) + "px " + F;
    var m = ctx.measureText(r.grade);
    ctx.fillText(r.grade, P + box / 2, P + box / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    ctx.textAlign = "left";
    // kicker and roast
    var tx = P + box + 52, tw = W - P - tx;
    ctx.fillStyle = "#737373"; ctx.font = "700 24px " + F;
    try { ctx.letterSpacing = "2px"; } catch (e) {}
    ctx.fillText("MY GTM STACK · " + r.score + "/100", tx, P + 24);
    try { ctx.letterSpacing = "-1.5px"; } catch (e) {}
    ctx.fillStyle = "#000";
    var size = r.roast.length > 70 ? 40 : r.roast.length > 48 ? 46 : 54, lines;
    for (;;) {
      ctx.font = "900 " + size + "px " + F;
      lines = wrapLines(ctx, r.roast, tw);
      if (P + 44 + lines.length * size * 1.08 <= top - 16 || size <= 26) break;
      size -= 2;
    }
    lines.forEach(function (l, i) { ctx.fillText(l, tx, P + 44 + size * 0.92 + i * size * 1.08); });
    try { ctx.letterSpacing = "0px"; } catch (e) {}
  }
  function mountCard(r) {
    var canvas = document.getElementById("card");
    if (!canvas) return;
    drawCard(canvas, r);
    if (document.fonts && document.fonts.load) {
      Promise.all(["900 54px Inter", "700 26px Inter", "500 24px Inter"].map(function (f) { return document.fonts.load(f); }))
        .then(function () { if (document.getElementById("card") === canvas) drawCard(canvas, r); }, function () {});
    }
    var btn = document.getElementById("save-card"), note = document.getElementById("share-note");
    if (!window.claude || !window.claude.use) return;
    window.claude.use("downloads").then(function (dl) {
      if (!dl || !document.body.contains(btn)) return;
      btn.hidden = false;
      btn.addEventListener("click", function () {
        canvas.toBlob(function (blob) {
          if (!blob) return;
          dl.save({ filename: "stack-here-grade-" + r.grade + ".png", data: blob }).then(
            function () { note.textContent = "Card saved."; },
            function (e) {
              if (e && e.code === "declined") return;
              if (e && e.code === "rate_limited") { note.textContent = "A save is already waiting for your answer."; return; }
              btn.hidden = true; note.textContent = "The card cannot be saved from this view. Take a screenshot of it instead.";
            });
        }, "image/png");
      });
    });
  }

  // ---- render and events ----
  function render() {
    var r = route();
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      var on = a.getAttribute("data-nav") === (r.view === "result" ? "home" : r.view);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (r.view === "tools") { view.innerHTML = toolsView(); return; }
    if (r.view === "insights") { view.innerHTML = insightsView(); return; }
    if (r.view === "result") {
      if (!current || current.hash !== r.hash) {
        var input = decode(r.hash);
        current = input ? { hash: r.hash, result: SH.analyze(input, { tools: TOOLS, learned: store.learned }) } : null;
      }
      if (current) { view.innerHTML = resultView(current.result); mountCard(current.result); return; }
      view.innerHTML = '<section class="hero"><h1>Stack not found.</h1><p>This link does not point to a stack. <a href="#home">Grade one</a>.</p></section>';
      return;
    }
    view.innerHTML = homeView();
  }

  view.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.id === "stack-form") {
      var text = document.getElementById("stack-text").value;
      var team = parseInt(document.getElementById("team-size").value, 10);
      var err = document.getElementById("form-err");
      var isExample = text.trim() === EXAMPLE.text;
      if (!grade(text, team > 0 ? team : null, isExample)) {
        err.textContent = text.trim() ? "None of those names matched a tool in the database. Check the spelling, or look at the Tools tab." : "Type at least one tool name.";
        err.hidden = false;
      }
    }
    if (e.target.id === "cut-form") {
      var msg = document.getElementById("cut-msg");
      var toolId = document.getElementById("cut-tool").value;
      var reason = document.getElementById("cut-reason").value;
      var repl = document.getElementById("cut-repl").value;
      if (!byId.get(toolId)) { msg.textContent = "Choose the tool you cut."; return; }
      var note = document.getElementById("cut-note").value
        .replace(/\S+@\S+/g, "[removed]").replace(/https?:\/\/\S+/g, "[removed]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[removed]").trim().slice(0, 280);
      msg.textContent = "Saving.";
      write("cuts", { toolId: toolId, reason: CUT_REASONS[reason] ? reason : "other", replacedBy: byId.get(repl) && repl !== toolId ? repl : null, note: note || null, createdAt: new Date().toISOString() })
        .then(function (ok) {
          msg.textContent = ok ? "Recorded. Thanks, " + name(toolId) + " is noted as cut." : "This could not be saved. Your access to this page is view-only.";
          if (ok) e.target.reset();
        });
    }
  });
  view.addEventListener("click", function (e) {
    var chip = e.target.closest("[data-sample]");
    if (!chip) return;
    var s = SH.SAMPLES[Number(chip.getAttribute("data-sample"))];
    grade(s.text, s.teamSize, true);
  });
  view.addEventListener("input", function (e) {
    if (e.target.id === "stack-text") { var n = document.getElementById("example-note"); if (n) n.hidden = e.target.value.trim() !== EXAMPLE.text; }
    if (e.target.id === "tool-filter") {
      var q = e.target.value.trim().toLowerCase();
      document.querySelectorAll("#tool-rows tr").forEach(function (tr) { tr.hidden = !!q && tr.getAttribute("data-k").indexOf(q) === -1; });
    }
  });
  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });

  store.learned = SH.computeLearnedRules([], [], TOOLS);
  render();
  connect();
})();
