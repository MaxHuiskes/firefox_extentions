/** MyAnimeList XML export (animelist_*.xml) import/export */

function malStatusToInternal(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "watching") return "watching";
  if (s === "completed") return "finished";
  if (s === "on-hold" || s === "onhold") return "hold";
  if (s === "dropped") return "dropped";
  if (s === "plan to watch" || s === "plantowatch") return "plantowatch";
  return normalizeStatus(status);
}

function internalStatusToMal(status) {
  switch (normalizeStatus(status)) {
    case "finished":
      return "Completed";
    case "hold":
      return "On-Hold";
    case "dropped":
      return "Dropped";
    case "plantowatch":
      return "Plan to Watch";
    default:
      return "Watching";
  }
}

function xmlText(el, tag) {
  if (!el) return "";
  const node = el.getElementsByTagName(tag)[0];
  if (!node) return "";
  return (node.textContent || "").trim();
}

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cdata(str) {
  const s = String(str || "").replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${s}]]>`;
}

/**
 * Parse MAL animelist XML → anime entries for this tracker.
 */
function parseMalAnimeXml(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid XML");
  }

  const root = doc.getElementsByTagName("myanimelist")[0];
  if (!root) {
    throw new Error("Not a MyAnimeList export (missing <myanimelist>)");
  }

  const animeNodes = root.getElementsByTagName("anime");
  const list = [];

  for (let i = 0; i < animeNodes.length; i++) {
    const node = animeNodes[i];
    const title = xmlText(node, "series_title");
    if (!title) continue;

    const malId = xmlText(node, "series_animedb_id");
    const episodes = xmlText(node, "my_watched_episodes") || "0";
    const status = malStatusToInternal(xmlText(node, "my_status"));
    const tagsRaw = xmlText(node, "my_tags");
    const score = Number(xmlText(node, "my_score") || 0) || 0;
    const seriesEpisodes = xmlText(node, "series_episodes");

    list.push({
      title,
      episode: episodes,
      status,
      tags: normalizeTags(tagsRaw),
      favorite: false,
      malId: malId || "",
      score,
      seriesEpisodes: seriesEpisodes || "",
      url: malId
        ? `https://myanimelist.net/anime/${malId}`
        : "",
      updatedAt: Date.now(),
    });
  }

  const myinfo = root.getElementsByTagName("myinfo")[0];
  return {
    animeList: list,
    userName: myinfo ? xmlText(myinfo, "user_name") : "",
    userId: myinfo ? xmlText(myinfo, "user_id") : "",
  };
}

/**
 * Build MAL-compatible animelist XML from tracker entries.
 */
function buildMalAnimeXml(animeList = [], options = {}) {
  const userName = options.userName || "AnimeTracker";
  const userId = options.userId || "0";
  const list = animeList || [];

  const counts = {
    watching: 0,
    finished: 0,
    hold: 0,
    dropped: 0,
    plantowatch: 0,
  };
  for (const item of list) {
    const s = normalizeStatus(item.status);
    if (counts[s] != null) counts[s] += 1;
  }

  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8" ?>`);
  parts.push(`<!--`);
  parts.push(` Created by Anime Progress Tracker (MAL-compatible export)`);
  parts.push(` Version 1.1.0`);
  parts.push(`-->`);
  parts.push(`<myanimelist>`);
  parts.push(`  <myinfo>`);
  parts.push(`    <user_id>${escapeXml(userId)}</user_id>`);
  parts.push(`    <user_name>${escapeXml(userName)}</user_name>`);
  parts.push(`    <user_export_type>1</user_export_type>`);
  parts.push(`    <user_total_anime>${list.length}</user_total_anime>`);
  parts.push(`    <user_total_watching>${counts.watching}</user_total_watching>`);
  parts.push(
    `    <user_total_completed>${counts.finished}</user_total_completed>`
  );
  parts.push(`    <user_total_onhold>${counts.hold}</user_total_onhold>`);
  parts.push(`    <user_total_dropped>${counts.dropped}</user_total_dropped>`);
  parts.push(
    `    <user_total_plantowatch>${counts.plantowatch}</user_total_plantowatch>`
  );
  parts.push(`  </myinfo>`);

  for (const item of list) {
    const malId = item.malId || "0";
    const ep = String(item.episode || "0");
    const score = Number(item.score) || 0;
    const tags = normalizeTags(item.tags).join(", ");
    parts.push(`  <anime>`);
    parts.push(`    <series_animedb_id>${escapeXml(malId)}</series_animedb_id>`);
    parts.push(`    <series_title>${cdata(item.title)}</series_title>`);
    parts.push(`    <series_type>TV</series_type>`);
    parts.push(
      `    <series_episodes>${escapeXml(item.seriesEpisodes || "0")}</series_episodes>`
    );
    parts.push(`    <my_id>0</my_id>`);
    parts.push(`    <my_watched_episodes>${escapeXml(ep)}</my_watched_episodes>`);
    parts.push(`    <my_start_date>0000-00-00</my_start_date>`);
    parts.push(`    <my_finish_date>0000-00-00</my_finish_date>`);
    parts.push(`    <my_rated></my_rated>`);
    parts.push(`    <my_score>${score}</my_score>`);
    parts.push(`    <my_storage></my_storage>`);
    parts.push(`    <my_storage_value>0.00</my_storage_value>`);
    parts.push(
      `    <my_status>${escapeXml(internalStatusToMal(item.status))}</my_status>`
    );
    parts.push(`    <my_comments>${cdata("")}</my_comments>`);
    parts.push(`    <my_times_watched>0</my_times_watched>`);
    parts.push(`    <my_rewatch_value></my_rewatch_value>`);
    parts.push(`    <my_priority>LOW</my_priority>`);
    parts.push(`    <my_tags>${cdata(tags)}</my_tags>`);
    parts.push(`    <my_rewatching>0</my_rewatching>`);
    parts.push(`    <my_rewatching_ep>0</my_rewatching_ep>`);
    parts.push(`    <my_discuss>1</my_discuss>`);
    parts.push(`    <my_sns>default</my_sns>`);
    parts.push(`    <update_on_import>1</update_on_import>`);
    parts.push(`  </anime>`);
  }

  parts.push(`</myanimelist>`);
  return parts.join("\n");
}

function isMalXml(text) {
  return /<myanimelist[\s>]/i.test(String(text || ""));
}
