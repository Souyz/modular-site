import { moduleLoaders } from "./modules/manifest.js";
import { createConfigPatch } from "./config-patch.js";
import { icon, withIcon, openDialog, confirmAction, notify, bindNavigation } from "./ui.js";

const app = document.querySelector("#app");
const adminTokenKey = "cloudflare-modular-site.admin-token";
const adminRoleKey = "cloudflare-modular-site.admin-role";
const homeLayoutKey = "cloudflare-modular-site.home-entry-layout";
const pageColumnsKeyPrefix = "cloudflare-modular-site.page-columns.";
const adminCommentIpKeyPrefix = "cloudflare-modular-site.admin-comment-ip.";
const pageAccessKeyPrefix = "cloudflare-modular-site.page-access.";
const maxUndoSteps = 50;
const moduleClickMoveThreshold = 10;
const externalLinkIconTextMaxLength = 8;
const moduleInteractionIgnoreSelector = "a, button, input, textarea, select, option, video, audio, details, summary, [contenteditable], [role=\"button\"], [role=\"link\"]";
const cubeCityLinkId = "builtin-cubecity";
const cubeCityPath = "/llrgamecubecity";
const llrMarioRunLinkId = "builtin-llr-mariorun";
const llrMarioRunPath = "/llr-mariorun";
const cubeCityLink = {
  id: cubeCityLinkId,
  title: "放松一下",
  description: "进入立方城，放松一下",
  targetUrl: cubeCityPath,
  visible: true,
  iconText: "GAME",
  iconImage: "/llrgamecubecity-entry.webp",
  backgroundImage: "/llrgamecubecity-entry.webp"
};
const llrMarioRunLink = {
  id: llrMarioRunLinkId,
  title: "老师大冒险",
  description: "选择素材包和关卡，开始横版跳跃挑战。",
  targetUrl: llrMarioRunPath,
  visible: true,
  iconText: "RUN",
  iconImage: "",
  backgroundImage: ""
};
const visitorSummaryFallback = {
  ip: "获取中",
  region: "获取中",
  isp: "获取中",
  recentVisits: "获取中"
};

const fallbackConfig = {
  version: 1,
  updatedAt: new Date().toISOString(),
  homeTitle: "功能入口",
  homeDescription: "这里是所有分页面的入口。管理员可以在 /admin 添加页面、分配模块和修改标题。",
  homeImage: "",
  commentBlockWords: [],
  announcement: {
    enabled: false,
    title: "公告",
    text: "",
    durationSeconds: 8
  },
  navOrder: ["page:workspace", `link:${cubeCityLinkId}`, `link:${llrMarioRunLinkId}`],
  links: [cubeCityLink, llrMarioRunLink],
  pages: [
    {
      id: "workspace",
      slug: "workspace",
      title: "模块工作台",
      description: "集中查看站点状态、便签、API 和发布清单。",
      backgroundImage: "",
      dailyBackgroundEnabled: false,
      locked: false,
      passwordEnabled: false,
      pagePassword: "",
      visible: true,
      entry: {
        title: "",
        description: "",
        iconText: "PG",
        iconImage: "",
        sidebarTitle: "",
        sidebarDescription: "",
        backgroundImage: ""
      },
      comments: {
        enabled: false,
        title: "评论",
        description: "留下你的想法。"
      },
      modules: ["overview", "notes", "api-status", "checklist"],
      blocks: [
        {
          id: "welcome",
          type: "text",
          icon: "IN",
          title: "开始使用",
          description: "这个文本模块可以在后台修改或删除。",
          body: "进入 /admin 后，可以新增分页面、修改页面标题、为页面勾选系统模块，也可以添加自定义文本模块。"
        }
      ],
      sections: [
        { id: "section-overview", type: "system", moduleId: "overview" },
        { id: "section-notes", type: "system", moduleId: "notes" },
        { id: "section-api-status", type: "system", moduleId: "api-status" },
        { id: "section-checklist", type: "system", moduleId: "checklist" },
        {
          id: "welcome",
          type: "text",
          icon: "IN",
          title: "开始使用",
          description: "这个文本模块可以在后台修改或删除。",
          body: "进入 /admin 后，可以新增分页面、修改页面标题、为页面勾选系统模块，也可以添加自定义文本模块。"
        }
      ]
    }
  ]
};

const state = {
  modules: [],
  config: fallbackConfig,
  token: localStorage.getItem(adminTokenKey) || "",
  adminRole: localStorage.getItem(adminRoleKey) || "admin",
  homeEntryLayout: localStorage.getItem(homeLayoutKey) === "one" ? "one" : "two",
  selectedItemType: "home",
  adminTab: "content",
  adminNavQuery: "",
  homeSearch: "",
  homeFilter: "all",
  dirty: false,
  savePending: false,
  mediaPending: 0,
  renderCleanups: [],
  saveError: false,
  navigationCleanup: null,
  selectedPageId: "",
  selectedLinkId: "",
  expandedSettings: "",
  expandedSections: new Set(),
  undoStack: [],
  undoFingerprint: "",
  commentCache: new Map(),
  commentRequests: new Map(),
  visitorSummary: null,
  preparedPageBackground: new Map(),
  saveStatus: "",
  savedConfig: null
};

class ApiError extends Error {
  constructor(message, status, code = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const api = {
  getJson: async (path, useAuth = false, cache = "no-store", credentials = "same-origin") => {
    const response = await fetch(path, requestOptions("GET", undefined, useAuth, cache, credentials));

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
  },
  postJson: async (path, body, useAuth = false) => {
    const response = await fetch(path, requestOptions("POST", body, useAuth));

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(payload.error || `Request failed: ${response.status}`, response.status, payload.code || "");
    }

    return response.json();
  },
  deleteJson: async (path, useAuth = false) => {
    const response = await fetch(path, requestOptions("DELETE", undefined, useAuth));

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(payload.error || `Request failed: ${response.status}`, response.status, payload.code || "");
    }

    return response.json();
  }
};

export async function startPublicApp(options = {}) {
  try {
    setLoadedConfig(await loadPublicConfig());
    if (getRouteSlug() === "p2p") {
      renderP2PTransferPage();
      return;
    }

    const pageSlug = getRouteSlug().split("/")[0];
    const page = state.config.pages.find((item) => item.visible && item.slug === pageSlug);
    const unlockedPage = page?.passwordEnabled ? getUnlockedPage(page.slug) : null;
    await loadModulesForPage(unlockedPage || page);
    renderPublicSite();
    if (page?.dailyBackgroundEnabled) {
      scheduleDailyBackground(page);
    }
  } finally {
    if (typeof options.beforeReveal === "function") {
      try {
        await options.beforeReveal();
      } catch {
        // Motion is progressive enhancement and must never block the site.
      }
    }
    document.documentElement.classList.remove("app-booting");
  }
}

export async function startAdminApp() {
  installAdminShortcuts();
  try {
    await renderAdmin();
  } finally {
    document.documentElement.classList.remove("app-booting");
  }
}

async function loadModules(ids = null) {
  const requested = ids ? new Set(ids) : null;
  const entries = requested
    ? moduleLoaders.filter((entry) => requested.has(entry.id))
    : moduleLoaders;
  const loaded = await Promise.all(entries.map((entry) => entry.load()));
  const modules = loaded.map((module) => module.default);
  const existing = new Map(state.modules.map((module) => [module.id, module]));

  for (const module of modules) {
    existing.set(module.id, module);
  }

  state.modules = [...existing.values()];
}

async function loadModulesForPage(page) {
  if (!page || page.kind === "blog") {
    return;
  }

  const ids = (page.sections || [])
    .filter((section) => section.type === "system" && section.moduleId)
    .map((section) => section.moduleId);

  if (ids.length > 0) {
    await loadModules(ids);
  }
}

function scheduleDailyBackground(page) {
  const run = () => {
    prepareDailyBackground(page).then((prepared) => {
      if (!prepared || getRouteSlug().split("/")[0] !== page.slug) return;
      applyPreparedDailyBackground(page);
    });
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 800 });
    return;
  }
  window.setTimeout(run, 0);
}

async function prepareDailyBackground(page) {
  if (!page?.dailyBackgroundEnabled || state.preparedPageBackground.has(page.slug)) {
    return state.preparedPageBackground.has(page?.slug);
  }

  const day = new Date().toISOString().slice(0, 10);
  const url = `/api/daily-background?day=${day}`;
  const image = new Image();
  image.src = url;
  let timeoutId;

  try {
    const decoded = typeof image.decode === "function"
      ? image.decode()
      : new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", reject, { once: true });
      });
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error("Daily background timed out")), 1200);
    });
    await Promise.race([decoded, timeout]);
    state.preparedPageBackground.set(page.slug, url);
    return true;
  } catch {
    state.preparedPageBackground.delete(page.slug);
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function applyPreparedDailyBackground(page) {
  const workspace = app.querySelector(".workspace");
  if (!workspace) return;
  applyPageBackground(workspace, resolvePageBackground(page));
}

function requestOptions(method, body, useAuth, cache = "no-store", credentials = "same-origin") {
  const headers = new Headers();

  if (body) {
    headers.set("content-type", "application/json");
  }

  if (useAuth && state.token) {
    headers.set("authorization", `Bearer ${state.token}`);
  }

  return {
    method,
    headers,
    cache,
    credentials,
    body: body ? JSON.stringify(body) : undefined
  };
}

async function loadPublicConfig() {
  try {
    const route = getRouteSlug();
    const query = route ? `?route=${encodeURIComponent(route)}` : "";
    const payload = await api.getJson(`/api/site-config${query}`, false, "no-cache", "same-origin");

    return payload.config || fallbackConfig;
  } catch {
    return fallbackConfig;
  }
}

async function renderAdmin() {
  if (!state.token) {
    renderLogin();
    return;
  }

  try {
    const payload = await api.getJson("/api/admin/config", true);
    setLoadedConfig(payload.config);
    state.adminRole = payload.role || state.adminRole || "admin";
    localStorage.setItem(adminRoleKey, state.adminRole);
    state.undoStack = [];
    state.undoFingerprint = "";
    ensureAdminSelection();
    await loadModules();
    renderAdminEditor();
  } catch {
    state.token = "";
    state.adminRole = "admin";
    localStorage.removeItem(adminTokenKey);
    localStorage.removeItem(adminRoleKey);
    renderLogin("登录已过期，请重新输入管理员密码。");
  }
}

function renderLogin(message = "") {
  setAppClass("login-screen");
  document.title = "登录管理后台 · 宽宽的网站";
  const shell = element("main", "login-layout");
  const story = element("section", "login-story");
  const brand = element("a", "brand login-brand");
  brand.href = "/";
  brand.append(element("span", "brand-mark", "宽"), textBlock("宽宽的网站", "PERSONAL SPACE"));
  story.append(brand, element("p", "eyebrow", "YOUR SPACE, YOUR WAY"), element("h1", "", "把想法，\n变成自己的空间。"), element("p", "login-story-copy", "记录日常，分享发现，整理常用工具。\n从这里，让每一页都更像你。"));
  const graphic = element("div", "login-graphic");
  for (const [name, label] of [["file", "页面"], ["blog", "文章"], ["link", "收藏"], ["image", "灵感"]]) {
    const tile = element("div", "login-graphic-tile");
    tile.append(icon(name), element("span", "", label));
    graphic.append(tile);
  }
  story.append(graphic, element("p", "login-story-footer", "一个小小的网站，装下很多可能。"));
  const panel = element("section", "login-panel");
  panel.append(element("span", "login-lock", ""));
  panel.firstChild.append(icon("shield"));
  panel.append(element("p", "eyebrow", "SITE STUDIO"), element("h2", "", "欢迎回来"), element("p", "login-description", "登录后，继续打理你的网站。"));
  const form = element("form", "login-form");
  const label = element("label", "field");
  label.append(element("span", "", "管理员密码"));
  const passwordRow = element("div", "password-input-wrap");
  const password = document.createElement("input");
  password.className = "input";
  password.type = "password";
  password.placeholder = "输入你的管理员密码";
  password.setAttribute("aria-label", "管理员密码");
  password.autocomplete = "current-password";
  password.required = true;
  const show = withIcon(button("", "icon-button password-toggle", "button"), "eye");
  show.setAttribute("aria-label", "显示密码");
  show.setAttribute("aria-pressed", "false");
  show.addEventListener("click", () => {
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    show.setAttribute("aria-label", visible ? "隐藏密码" : "显示密码");
    show.setAttribute("aria-pressed", String(visible));
  });
  passwordRow.append(password, show);
  label.append(passwordRow);
  const submit = withIcon(button("进入管理后台", "button primary", "submit"), "arrow");
  const feedback = element("p", "form-error", message);
  feedback.id = "login-feedback";
  feedback.setAttribute("role", "alert");
  password.setAttribute("aria-describedby", feedback.id);
  form.append(label, feedback, submit);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "正在登录…";
    feedback.textContent = "";
    password.removeAttribute("aria-invalid");
    try {
      const payload = await api.postJson("/api/admin/login", { password: password.value });
      state.token = payload.token;
      state.adminRole = payload.role || "admin";
      state.adminNavQuery = "";
      state.adminTab = "content";
      state.saveStatus = "";
      setLoadedConfig(payload.config);
      state.undoStack = [];
      state.undoFingerprint = "";
      ensureAdminSelection();
      localStorage.setItem(adminTokenKey, state.token);
      localStorage.setItem(adminRoleKey, state.adminRole);
      await loadModules();
      renderAdminEditor();
    } catch (error) {
      feedback.textContent = error.message;
      password.setAttribute("aria-invalid", "true");
      submit.disabled = false;
      submit.replaceChildren(icon("arrow"), document.createTextNode("进入管理后台"));
      password.focus();
    }
  });
  const back = element("a", "login-back-link", "返回网站");
  back.href = "/";
  back.prepend(icon("home"));
  panel.append(form, element("p", "login-note", "完整管理员和协作管理员使用各自的密码登录。"), back);
  shell.append(story, panel);
  app.append(shell);
  password.focus({ preventScroll: true });
}

function renderAdminEditor() {
  const previousKey = state.adminRenderKey;
  const previousScroll = window.scrollY;
  const navScroll = app.querySelector(".admin-content-nav")?.scrollTop || 0;
  setAppClass("admin-shell");
  ensureAdminSelection();
  const selectedItem = getSelectedAdminItem();
  const selectedPage = selectedItem?.page;
  const selectedLink = selectedItem?.link;
  const limited = isLimitedAdmin();
  const gameEditorMode = shouldRenderAdminGameEditor() && !limited;
  const currentKey = `${selectedItem?.type}:${selectedPage?.id || selectedLink?.id || ""}:${state.adminTab}:${gameEditorMode}`;
  state.adminRenderKey = currentKey;
  const title = gameEditorMode ? "游戏素材" : selectedPage?.title || selectedLink?.title || (selectedItem?.type === "logs" ? "访问记录" : "主页与站点");
  document.title = `${title} · 站点后台`;
  const sidebar = element("aside", "sidebar admin-sidebar");
  sidebar.id = "site-navigation";
  sidebar.setAttribute("aria-label", "管理导航");
  const brand = element("a", "brand admin-brand");
  brand.href = "/admin";
  brand.append(element("span", "brand-mark", "宽"), textBlock("SITE STUDIO", "宽宽的网站后台"));
  const close = withIcon(button("", "icon-button drawer-close", "button"), "close");
  close.setAttribute("aria-label", "关闭导航菜单");
  const brandRow = element("div", "sidebar-brand-row");
  brandRow.append(brand, close);
  const siteNav = element("nav", "module-nav admin-site-nav");
  siteNav.setAttribute("aria-label", "站点管理");
  for (const [type, name, symbol] of [["home", "主页与站点", "home"], ["logs", "访问记录", "chart"]]) {
    const item = withIcon(button(name, "admin-nav-button", "button"), symbol);
    item.classList.toggle("is-active", !gameEditorMode && selectedItem?.type === type);
    item.setAttribute("aria-current", item.classList.contains("is-active") ? "page" : "false");
    item.disabled = limited;
    item.addEventListener("click", () => selectAdminItem(type));
    siteNav.append(item);
  }
  const navigationItems = adminNavItems().filter(item => !limited || item.type === "page");
  const navHeading = element("div", "sidebar-section-heading");
  navHeading.append(element("span", "", "网站内容"), element("span", "nav-total", String(navigationItems.length)));
  const search = element("label", "search-field sidebar-search");
  search.append(icon("search"));
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "查找页面或入口";
  searchInput.setAttribute("aria-label", "查找页面或入口");
  searchInput.value = state.adminNavQuery;
  searchInput.dataset.adminSearch = "true";
  search.append(searchInput);
  const pageNav = element("nav", "module-nav admin-content-nav");
  pageNav.setAttribute("aria-label", "页面与网站入口");
  const groups = [];
  for (const navItem of navigationItems) {
    const page = navItem.page, link = navItem.link;
    const group = element("section", "admin-page-nav-item");
    group.dataset.navKey = navItem.key;
    if (page) group.dataset.pageId = page.id;
    else group.dataset.linkId = link.id;
    const item = button("", "admin-nav-button content-nav-button", "button");
    const active = !gameEditorMode && selectedItem?.type === navItem.type && (page ? page.id === state.selectedPageId : link.id === state.selectedLinkId);
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    const label = page ? sidebarPageTitle(page) : link.title;
    item.append(page ? pageSidebarMark(page) : linkMark(link), textBlock(label, page ? (page.kind === "blog" ? "博客" : `/${page.slug}`) : externalLinkSubtitle(link)));
    if (!(page || link).visible) {
      const badge = element("span", "nav-hidden-dot");
      badge.title = "已隐藏";
      item.append(badge);
    }
    item.addEventListener("click", () => selectAdminItem(navItem.type, (page || link).id));
    group.append(item);
    if (!limited) {
      const grip = withIcon(button("", "icon-button admin-drag-handle", "button"), "grip");
      grip.setAttribute("aria-label", `调整${label}的顺序`);
      grip.title = "拖动调整顺序；也可按 Alt + 上下方向键";
      attachPointerSort(grip, group, "nav", navItem.key, pageNav);
      grip.addEventListener("keydown", event => {
        if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const items = adminNavItems();
        const at = items.findIndex(entry => entry.key === navItem.key);
        const target = items[at + (event.key === "ArrowUp" ? -1 : 1)];
        if (target) reorderNavByKey(navItem.key, target.key);
      });
      group.append(grip);
    }
    group.dataset.searchText = `${label} ${page?.slug || link?.targetUrl || ""}`.toLocaleLowerCase();
    pageNav.append(group);
    groups.push(group);
  }
  const noResults = element("p", "nav-empty", "没有找到匹配的内容");
  pageNav.append(noResults);
  const filterNav = () => {
    state.adminNavQuery = searchInput.value;
    const query = searchInput.value.trim().toLocaleLowerCase();
    for (const group of groups) group.hidden = !group.dataset.searchText.includes(query);
    noResults.hidden = groups.some(group => !group.hidden);
  };
  searchInput.addEventListener("input", filterNav);
  filterNav();
  const add = withIcon(button("新增内容", "button primary sidebar-create", "button"), "plus");
  add.disabled = limited;
  add.addEventListener("click", openCreateContentDialog);
  const footer = element("div", "admin-sidebar-footer");
  const visit = element("a", "sidebar-visit", "查看网站");
  visit.href = "/";
  visit.target = "_blank";
  visit.rel = "noopener noreferrer";
  visit.append(icon("external"));
  const account = element("div", "admin-account");
  account.append(element("span", "account-avatar", "宽"), textBlock(limited ? "协作管理员" : "管理员", limited ? "受限编辑权限" : "完整管理权限"));
  const logout = withIcon(button("", "icon-button", "button"), "logout");
  logout.setAttribute("aria-label", "退出登录");
  logout.addEventListener("click", async () => {
    if (state.dirty && !(await confirmAction({ title: "退出前还有未保存的修改", description: "退出会丢失当前未保存的内容。你可以取消并先保存。", confirmLabel: "退出登录", destructive: true }))) return;
    state.token = "";
    state.adminRole = "admin";
    state.dirty = false;
    state.adminNavQuery = "";
    state.adminTab = "content";
    state.selectedItemType = "home";
    state.openArticleId = "";
    state.saveStatus = "";
    localStorage.removeItem(adminTokenKey);
    localStorage.removeItem(adminRoleKey);
    renderLogin();
  });
  account.append(logout);
  footer.append(visit, account);
  sidebar.append(brandRow, element("p", "sidebar-section-label", "工作空间"), siteNav, navHeading, search, pageNav, add, footer);
  const main = element("main", "admin-workspace");
  const topbar = element("header", "admin-topbar");
  const crumb = element("div", "admin-breadcrumb");
  crumb.append(element("span", "", "站点后台"), icon("chevron"), element("strong", "", title));
  topbar.append(crumb);
  if (!gameEditorMode) topbar.append(renderSaveBar(selectedItem));
  const content = element("div", "admin-content");
  const heading = element("header", "admin-content-heading");
  const headingCopy = element("div");
  headingCopy.append(element("p", "eyebrow", gameEditorMode ? "GAME LIBRARY" : selectedItem?.type === "home" ? "YOUR WEBSITE" : selectedPage?.kind === "blog" ? "WRITING ROOM" : "CONTENT STUDIO"), element("h1", "", title));
  const descriptions = { home: "整理首页与站点信息，让每个入口都清晰好找。", logs: "查看网站访问与评论拦截记录。", link: "完善入口信息、图标和展示方式。", page: selectedPage?.kind === "blog" ? "专注写作，管理文章与博客展示。" : "组织内容模块，打磨页面的每个细节。" };
  headingCopy.append(element("p", "", descriptions[selectedItem?.type] || "管理游戏素材与关卡数据。"));
  heading.append(headingCopy);
  if (selectedPage || selectedLink) heading.append(element("span", `visibility-badge${(selectedPage || selectedLink).visible ? "" : " is-hidden"}`, (selectedPage || selectedLink).visible ? "公开展示" : "已隐藏"));
  content.append(heading);
  if (!gameEditorMode && selectedItem?.type !== "logs") content.append(renderAdminTabs(selectedItem));
  if (gameEditorMode) {
    content.append(renderAdminGameEditor());
  }
  else if (selectedItem?.type === "logs") content.append(renderAccessLogsPanel());
  else if (selectedItem?.type === "home") content.append(state.adminTab === "security" ? renderSiteSecurity() : renderHomeSettings());
  else if (selectedPage) content.append(renderPreviewEditor(selectedPage));
  else if (selectedLink) content.append(renderExternalLinkEditor(selectedLink));
  main.append(topbar, content);
  const { bar, trigger } = renderMobileTopbar("站点后台");
  const scrim = button("", "navigation-scrim", "button");
  scrim.setAttribute("aria-label", "关闭导航菜单");
  app.replaceChildren(bar, sidebar, main, scrim);
  state.navigationCleanup = bindNavigation(app, sidebar, trigger, scrim);
  close.addEventListener("click", () => scrim.click());
  pageNav.scrollTop = navScroll;
  window.scrollTo({ top: previousKey === currentKey ? previousScroll : 0, behavior: "instant" });
  setSaveBarStatus(state.saveStatus, state.savePending);
}

function shouldRenderAdminGameEditor() {
  return new URLSearchParams(window.location.search).get("game") === "llr-mariorun";
}

function clearAdminGameEditorMode() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("game")) return;
  url.searchParams.delete("game");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function renderPageSidebarSettings(page) {
  const settings = element("div", "admin-page-settings");
  const limited = isLimitedAdmin();
  const lockedForLimited = limited && page.locked;
  settings.append(
    sidebarField("侧边栏标题", page.entry.sidebarTitle || "", (value) => {
      page.entry.sidebarTitle = value;
    }, "留空时跟随分页面标题。", lockedForLimited)
  );
  settings.append(
    sidebarField("后缀", page.slug, (value) => {
      page.slug = uniquePageSlug(page, value);
    }, "", lockedForLimited)
  );
  settings.append(
    sidebarAreaField("侧边栏说明", page.entry.sidebarDescription || "", (value) => {
      page.entry.sidebarDescription = value;
    }, lockedForLimited)
  );
  settings.append(
    checkbox("主页显示", page.visible, (checked) => {
      page.visible = checked;
      renderAdminEditor();
    }, lockedForLimited)
  );

  if (!limited) {
    settings.append(
      checkbox("锁定分页面（限制低权限）", page.locked, (checked) => {
        page.locked = checked;
        renderAdminEditor();
      })
    );
  }

  settings.append(element("p", "form-hint", page.locked ? "这个分页面已锁定，低权限管理员无法编辑。" : "图标、背景和评论区域在右侧模块编辑上方设置。"));
  return settings;
}

function renderExternalLinkSidebarSettings(link) {
  const settings = element("div", "admin-page-settings");
  settings.append(
    sidebarField("名称", link.title, (value) => {
      link.title = value;
    })
  );
  settings.append(
    sidebarField("目标网址", link.targetUrl, (value) => {
      link.targetUrl = value.trim();
    })
  );
  settings.append(
    sidebarAreaField("说明", link.description, (value) => {
      link.description = value;
    })
  );
  settings.append(
    checkbox("显示入口", link.visible, (checked) => {
      link.visible = checked;
      renderAdminEditor();
    })
  );
  return settings;
}

function renderHomeSettings() {
  const region = element("div", "home-settings-layout");
  const overview = element("section", "admin-overview");
  const articleCount = state.config.pages.reduce((total, page) => total + (page.blog?.articles?.length || 0) + (page.sections || []).filter(section => section.type === "blog").reduce((sum, section) => sum + (section.articles?.length || 0), 0), 0);
  for (const [symbol, value, label] of [["file", state.config.pages.length, "分页面"], ["link", state.config.links.length, "网站入口"], ["blog", articleCount, "已发布文章"]]) {
    const metric = element("div", "overview-metric");
    metric.append(icon(symbol), element("strong", "", String(value)), element("span", "", label));
    overview.append(metric);
  }
  region.append(overview);
  const info = element("section", "admin-panel site-information");
  info.append(sectionHeading("站点信息", "访客打开首页时，最先看到的介绍。"));
  info.append(field("主页标题", state.config.homeTitle, value => { state.config.homeTitle = value; }), areaField("主页说明", state.config.homeDescription, value => { state.config.homeDescription = value; }, "简短介绍这个空间，或分享你最近在做的事。"));
  const visual = element("section", "admin-panel site-visual");
  visual.append(sectionHeading("首页展示图片", "一张照片，让这个空间更有你的气息。"));
  visual.append(compactImageValueField("展示图片", state.config.homeImage, value => { state.config.homeImage = value; }, { hint: "支持上传或填写图片地址，建议使用横向图片。" }));
  const preview = element("div", "home-copy-preview");
  preview.append(element("span", "eyebrow", "首页文字预览"), element("strong", "", state.config.homeTitle), element("p", "", state.config.homeDescription));
  visual.append(preview);
  info.addEventListener("input", () => {
    preview.querySelector("strong").textContent = state.config.homeTitle;
    preview.querySelector("p").textContent = state.config.homeDescription;
  });
  const announcement = state.config.announcement;
  const notice = element("section", "admin-panel announcement-settings");
  notice.append(sectionHeading("首页公告", "有新消息时，让访客第一时间看到。"));
  notice.append(checkbox("在首页显示公告", announcement.enabled, checked => { announcement.enabled = checked; renderAdminEditor(); }));
  if (announcement.enabled) {
    const row = element("div", "admin-row");
    row.append(field("公告标题", announcement.title, value => { announcement.title = value; }), numberField("自动关闭时间（秒）", announcement.durationSeconds, 0, 120, 1, value => { announcement.durationSeconds = value; }));
    notice.append(row, areaField("公告内容", announcement.text, value => { announcement.text = value; }), element("p", "form-hint", "关闭时间设为 0 时，公告会保留到访客主动关闭。"));
  }
  region.append(info, visual, notice);
  return region;
}

function renderAdminGameEditor() {
  const section = element("section", "announcement-settings game-admin-panel");
  section.dataset.gameEditor = "root";
  section.append(element("h3", "", "老师大冒险：素材包与游戏数据"));
  section.append(element("p", "form-hint", "完整管理员可在线编辑 /llr-mariorun 的素材包、PCK 和游戏数据。关卡设计已放到游戏内，网站后台只负责保存数据。素材文件暂存 KV，素材包/游戏数据元数据走 D1。"));

  const status = element("p", "form-hint", "正在加载游戏配置…");
  const content = element("div", "game-admin-content");
  section.append(status, content);

  loadAdminGameConfig().then((config) => {
    status.textContent = "";
    content.replaceChildren(renderGameAssetPackEditor(config), renderPckArchiveEditor(config), renderGameDataEditor(config));
  }).catch((error) => {
    status.textContent = `加载失败：${error.message}`;
  });

  return section;
}

async function loadAdminGameConfig() {
  return adminGameRequest("/api/admin/game", { method: "GET" });
}

function renderGameAssetPackEditor(config) {
  const panel = element("div", "game-editor-card");
  panel.dataset.gameEditor = "asset-packs";
  const packs = structuredClone(config.assetPacks || []);
  const slots = config.slots || [];
  const textarea = document.createElement("textarea");
  textarea.className = "input game-json-editor";
  textarea.value = JSON.stringify(packs, null, 2);
  const save = button("保存素材包元数据", "button primary", "button");
  const add = button("复制第一个素材包", "button", "button");
  const exportButton = button("导出当前素材包", "button", "button");
  const templateButton = button("下载素材包模板", "button", "button");
  const importLabel = element("label", "button game-import-button", "导入本地素材包");
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importLabel.append(importInput);
  const slotGrid = element("div", "game-asset-slot-grid");
  const feedback = element("p", "form-hint", "");

  add.addEventListener("click", () => {
    const source = JSON.parse(textarea.value || "[]")[0] || { assets: {} };
    const next = {
      ...source,
      id: `pack-${Date.now()}`,
      name: `${source.name || "素材包"} 副本`,
      builtin: false,
      default: false,
      updatedAt: new Date().toISOString()
    };
    textarea.value = JSON.stringify([...(JSON.parse(textarea.value || "[]")), next], null, 2);
  });

  save.addEventListener("click", async () => {
    try {
      const assetPacks = JSON.parse(textarea.value || "[]");
      await adminGameRequest("/api/admin/game/asset-packs", { method: "PUT", body: JSON.stringify({ assetPacks }) });
      feedback.textContent = "素材包已保存。";
    } catch (error) {
      feedback.textContent = `保存失败：${error.message}`;
    }
  });

  exportButton.addEventListener("click", () => {
    try {
      const assetPacks = JSON.parse(textarea.value || "[]");
      downloadJson(`llr-mariorun-asset-packs-${Date.now()}.json`, {
        version: 1,
        exportedAt: new Date().toISOString(),
        assetPacks
      });
      feedback.textContent = "已导出当前素材包 JSON。";
    } catch (error) {
      feedback.textContent = `导出失败：${error.message}`;
    }
  });

  templateButton.addEventListener("click", () => {
    const templateAssets = {};
    for (const slot of slots) {
      templateAssets[slot.id] = templateAssetForSlot(slot);
    }
    downloadJson("llr-mariorun-asset-pack-template.json", {
      version: 1,
      assetPacks: [{
        id: "local-teacher-pack",
        name: "本地老师素材包",
        description: "JSON 负责素材包清单；小素材可用 dataUrl 内嵌导入，大素材会上传后转成 key/url 引用。Godot 游戏本体仍需要 pck 或等价构建产物。",
        coverSlot: "ui.cover",
        enabled: true,
        builtin: false,
        default: true,
        assets: templateAssets,
        updatedAt: new Date().toISOString()
      }]
    });
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    feedback.textContent = `导入 ${file.name} 中…`;
    try {
      const importedPacks = await importLocalGameAssetPacks(file, slots, feedback);
      textarea.value = JSON.stringify(importedPacks, null, 2);
      feedback.textContent = `已导入 ${importedPacks.length} 个素材包；确认无误后点“保存素材包元数据”。`;
    } catch (error) {
      feedback.textContent = `导入失败：${error.message}`;
    } finally {
      importInput.value = "";
    }
  });

  for (const slot of slots) {
    const item = element("label", "game-asset-slot");
    item.dataset.gameSlot = slot.id;
    const upload = document.createElement("input");
    upload.type = "file";
    upload.accept = slot.kind === "audio" ? "audio/*" : slot.kind === "bundle" ? ".pck,application/octet-stream" : "image/*";
    upload.addEventListener("change", async () => {
      const file = upload.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append("slotId", slot.id);
      form.append("file", file);
      feedback.textContent = `上传 ${slot.label} 中…`;
      try {
        const payload = await adminGameUpload("/api/admin/game/assets", form);
        const assetPacks = JSON.parse(textarea.value || "[]");
        const first = assetPacks[0] || { id: "teacher-default", name: "老师默认版", assets: {} };
        first.assets = first.assets || {};
        first.assets[slot.id] = payload.asset;
        assetPacks[0] = first;
        textarea.value = JSON.stringify(assetPacks, null, 2);
        feedback.textContent = `${slot.label} 已上传，记得保存素材包元数据。`;
      } catch (error) {
        feedback.textContent = `上传失败：${error.message}`;
      } finally {
        upload.value = "";
      }
    });
    const downloadCurrent = button("下载当前素材", "button small", "button");
    downloadCurrent.addEventListener("click", () => {
      const asset = findFirstAssetForSlot(textarea.value, slot.id);
      if (!asset?.url) {
        feedback.textContent = `${slot.label} 还没有可下载的素材。`;
        return;
      }
      const link = document.createElement("a");
      link.href = asset.url;
      link.download = asset.key?.split("/").pop() || defaultAssetFilename(slot);
      document.body.append(link);
      link.click();
      link.remove();
      feedback.textContent = `已开始下载 ${slot.label}。`;
    });
    item.append(element("strong", "", slot.label), element("small", "", slot.id), upload, downloadCurrent);
    slotGrid.append(item);
  }

  const tools = element("div", "game-editor-tools");
  tools.append(importLabel, exportButton, templateButton);
  panel.append(element("h4", "", "素材在线编辑"), element("p", "form-hint", "素材就在这里在线编辑：每个槽位可直接上传图片/音频/PCK，也可下载当前素材。上传槽位默认写入第一个素材包；JSON 只管理素材包清单和引用，不建议塞完整 pck。"), tools, slotGrid, textarea, add, save, feedback);
  return panel;
}

function renderPckArchiveEditor(config) {
  const panel = element("div", "game-editor-card pck-editor-card");
  const builtinPckUrl = (pack) => pack?.id === "original"
    ? `/llr-mariorun/godot/index.pck?pack=${encodeURIComponent(pack.id)}&source=pck-editor`
    : "";
  const pckUrl = (pack) => pack?.assets?.["game.bundle.pck"]?.url || builtinPckUrl(pack);
  const packs = structuredClone(config.assetPacks || []).filter((pack) => pckUrl(pack));
  const packSelect = document.createElement("select");
  packSelect.className = "input";
  const inspect = button("查看 PCK 内容", "button", "button");
  const download = button("下载整理后的 PCK", "button", "button");
  const saveAsPack = button("保存成新素材包", "button primary", "button");
  const addFileLabel = element("label", "button game-import-button", "导入文件到 PCK");
  const addFileInput = document.createElement("input");
  addFileInput.type = "file";
  addFileLabel.append(addFileInput);
  const list = element("div", "pck-entry-list");
  const preview = element("div", "pck-entry-preview", "选择一个文件后预览。");
  const feedback = element("p", "form-hint", "");
  let archive = null;
  let selectedPath = "";

  packSelect.replaceChildren(...packs.map((pack) => new Option(
    `${pack.name || pack.id}${builtinPckUrl(pack) ? "（内置）" : ""}`,
    pack.id
  )));

  const selectedPack = () => packs.find((pack) => pack.id === packSelect.value) || packs[0];
  const selectedEntry = () => archive?.entries.find((entry) => entry.path === selectedPath);

  const renderEntries = () => {
    if (!archive) {
      list.replaceChildren(element("p", "form-hint", "还没有载入 PCK。"));
      return;
    }
    const rows = archive.entries.map((entry) => {
      const row = element("button", `pck-entry${entry.path === selectedPath ? " is-active" : ""}`, "button");
      row.textContent = `${entry.path} · ${formatBytes(entry.size)}`;
      row.addEventListener("click", () => {
        selectedPath = entry.path;
        renderEntries();
        renderPckPreview(archive, entry, preview);
      });
      return row;
    });
    list.replaceChildren(...rows);
  };

  inspect.addEventListener("click", async () => {
    const pack = selectedPack();
    const sourceUrl = pckUrl(pack);
    if (!sourceUrl) {
      feedback.textContent = "这个素材包没有 game.bundle.pck。";
      return;
    }
    feedback.textContent = `正在读取 ${pack.name || pack.id}…`;
    try {
      const response = await fetch(sourceUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`下载失败：${response.status}`);
      archive = parseGodotPck(await response.arrayBuffer());
      selectedPath = archive.entries[0]?.path || "";
      renderEntries();
      if (selectedPath) renderPckPreview(archive, selectedEntry(), preview);
      feedback.textContent = `已载入 ${archive.entries.length} 个文件。可替换、删除、导入文件后重新保存。`;
    } catch (error) {
      feedback.textContent = `读取失败：${error.message}`;
    }
  });

  download.addEventListener("click", () => {
    if (!archive) {
      feedback.textContent = "请先查看一个 PCK。";
      return;
    }
    downloadBlob(new Blob([buildGodotPck(archive)], { type: "application/octet-stream" }), `edited-${Date.now()}.pck`);
    feedback.textContent = "已生成并下载新的 PCK。";
  });

  saveAsPack.addEventListener("click", async () => {
    if (!archive) {
      feedback.textContent = "请先查看一个 PCK。";
      return;
    }
    const basePack = selectedPack();
    const name = prompt("新素材包名称", `${basePack?.name || "素材包"} 编辑版`);
    if (!name) return;
    try {
      feedback.textContent = "正在上传新 PCK…";
      const pckFile = new File([buildGodotPck(archive)], "game.bundle.pck", { type: "application/octet-stream" });
      const form = new FormData();
      form.append("slotId", "game.bundle.pck");
      form.append("file", pckFile);
      const payload = await adminGameUpload("/api/admin/game/assets", form);
      const nextPack = {
        ...(basePack || {}),
        id: `pck-edited-${Date.now()}`,
        name,
        description: `由 PCK 在线编辑器整理生成：${new Date().toLocaleString()}`,
        builtin: false,
        default: false,
        enabled: true,
        assets: {
          ...(basePack?.assets || {}),
          "game.bundle.pck": payload.asset
        },
        updatedAt: new Date().toISOString()
      };
      const assetPacks = [...(config.assetPacks || []), nextPack];
      await adminGameRequest("/api/admin/game/asset-packs", { method: "PUT", body: JSON.stringify({ assetPacks }) });
      feedback.textContent = `新素材包「${name}」已保存。刷新游戏页即可选择。`;
    } catch (error) {
      feedback.textContent = `保存失败：${error.message}`;
    }
  });

  addFileInput.addEventListener("change", async () => {
    const file = addFileInput.files?.[0];
    if (!file || !archive) {
      addFileInput.value = "";
      return;
    }
    const path = prompt("写入 PCK 的路径，例如 res://classes/player/mario_sheet.png", `res://${file.name}`);
    if (!path) {
      addFileInput.value = "";
      return;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    upsertPckEntry(archive, normalizePckPath(path), data);
    selectedPath = normalizePckPath(path);
    renderEntries();
    renderPckPreview(archive, selectedEntry(), preview);
    feedback.textContent = `已导入 ${selectedPath}，记得下载或保存成新素材包。`;
    addFileInput.value = "";
  });

  const replaceCurrent = button("替换选中文件", "button", "button");
  const replaceInput = document.createElement("input");
  replaceInput.type = "file";
  replaceInput.hidden = true;
  replaceCurrent.addEventListener("click", () => replaceInput.click());
  replaceInput.addEventListener("change", async () => {
    const file = replaceInput.files?.[0];
    const entry = selectedEntry();
    if (!file || !archive || !entry) {
      replaceInput.value = "";
      return;
    }
    upsertPckEntry(archive, entry.path, new Uint8Array(await file.arrayBuffer()));
    renderEntries();
    renderPckPreview(archive, selectedEntry(), preview);
    feedback.textContent = `已替换 ${entry.path}。`;
    replaceInput.value = "";
  });
  const deleteCurrent = button("删除选中文件", "button danger", "button");
  deleteCurrent.addEventListener("click", () => {
    const entry = selectedEntry();
    if (!archive || !entry) return;
    if (!confirm(`确定从 PCK 删除 ${entry.path}？`)) return;
    archive.entries = archive.entries.filter((item) => item.path !== entry.path);
    selectedPath = archive.entries[0]?.path || "";
    renderEntries();
    preview.textContent = selectedPath ? "已删除，选择文件预览。" : "PCK 已没有文件。";
  });

  const tools = element("div", "game-editor-tools");
  tools.append(packSelect, inspect, addFileLabel, replaceCurrent, replaceInput, deleteCurrent, download, saveAsPack);
  panel.append(element("h4", "", "PCK 在线编辑器"), element("p", "form-hint", "可直接读取内置原版，也可选择已经上传的 game.bundle.pck 在线查看内容。支持文件级编辑：预览常见图片/音频/文本，替换或删除文件，最后整理并保存成新的 PCK 素材包。内置原版不会被覆盖；Godot 内部 .ctex/.scn/.res 会按二进制文件处理。"), tools, list, preview, feedback);
  return panel;
}

function parseGodotPck(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder();
  const magic = decoder.decode(bytes.slice(0, 4));
  if (magic !== "GDPC") throw new Error("不是 Godot PCK 文件。");
  const headerSize = 100;
  const packFlags = view.getUint32(20, true);
  const fileBase = Number(view.getBigUint64(24, true));
  const fileCount = view.getUint32(96, true);
  let cursor = headerSize;
  const entries = [];
  for (let index = 0; index < fileCount; index += 1) {
    const pathLength = view.getUint32(cursor, true);
    cursor += 4;
    const rawPath = bytes.slice(cursor, cursor + pathLength);
    cursor += pathLength;
    const zero = rawPath.indexOf(0);
    const path = decoder.decode(zero >= 0 ? rawPath.slice(0, zero) : rawPath);
    const offset = Number(view.getBigUint64(cursor, true));
    cursor += 8;
    const size = Number(view.getBigUint64(cursor, true));
    cursor += 8;
    const md5 = bytes.slice(cursor, cursor + 16);
    cursor += 16;
    const flags = view.getUint32(cursor, true);
    cursor += 4;
    const dataOffset = fileBase + offset;
    entries.push({ path, offset, size, md5, flags, data: bytes.slice(dataOffset, dataOffset + size) });
  }
  return {
    header: bytes.slice(0, headerSize),
    packFlags,
    fileBase,
    entries
  };
}

function buildGodotPck(archive) {
  const encoder = new TextEncoder();
  const header = new Uint8Array(archive.header);
  const records = archive.entries.map((entry) => {
    const pathBytes = encoder.encode(entry.path);
    const paddedLength = align4(pathBytes.length + 1);
    const pathBuffer = new Uint8Array(paddedLength);
    pathBuffer.set(pathBytes);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || []);
    return { ...entry, pathBuffer, data };
  });
  const indexSize = records.reduce((sum, record) => sum + 4 + record.pathBuffer.length + 8 + 8 + 16 + 4, 0);
  const fileBase = header.length + indexSize;
  const totalSize = fileBase + records.reduce((sum, record) => sum + record.data.length, 0);
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  output.set(header, 0);
  view.setUint32(20, archive.packFlags || 0, true);
  view.setBigUint64(24, BigInt(fileBase), true);
  view.setUint32(96, records.length, true);
  let cursor = header.length;
  let dataOffset = 0;
  for (const record of records) {
    view.setUint32(cursor, record.pathBuffer.length, true);
    cursor += 4;
    output.set(record.pathBuffer, cursor);
    cursor += record.pathBuffer.length;
    view.setBigUint64(cursor, BigInt(dataOffset), true);
    cursor += 8;
    view.setBigUint64(cursor, BigInt(record.data.length), true);
    cursor += 8;
    output.set(record.md5 || new Uint8Array(16), cursor);
    cursor += 16;
    view.setUint32(cursor, record.flags || 0, true);
    cursor += 4;
    output.set(record.data, fileBase + dataOffset);
    dataOffset += record.data.length;
  }
  return output;
}

function upsertPckEntry(archive, path, data) {
  const existing = archive.entries.find((entry) => entry.path === path);
  const next = { path, offset: 0, size: data.length, md5: new Uint8Array(16), flags: 0, data };
  if (existing) {
    Object.assign(existing, next);
  } else {
    archive.entries.push(next);
    archive.entries.sort((left, right) => left.path.localeCompare(right.path));
  }
}

function normalizePckPath(path) {
  const value = String(path || "").replaceAll("\\", "/").trim();
  return value.startsWith("res://") ? value : `res://${value.replace(/^\/+/, "")}`;
}

function guessPckEntryType(path) {
  const lower = String(path || "").toLowerCase();
  if (/\.(png|jpg|jpeg|webp|gif)$/.test(lower)) return "image";
  if (/\.(mp3|ogg|wav)$/.test(lower)) return "audio";
  if (/\.(json|txt|cfg|gd|import|xml|tres|tscn|md)$/.test(lower)) return "text";
  return "binary";
}

function renderPckPreview(archive, entry, preview) {
  preview.replaceChildren();
  if (!archive || !entry) {
    preview.textContent = "选择一个文件后预览。";
    return;
  }
  const type = guessPckEntryType(entry.path);
  const blob = new Blob([entry.data], { type: type === "image" ? "image/png" : type === "audio" ? "audio/ogg" : "application/octet-stream" });
  preview.append(element("strong", "", entry.path), element("small", "", `${formatBytes(entry.size)} · ${type}`));
  if (type === "image") {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(blob);
    img.alt = entry.path;
    preview.append(img);
  } else if (type === "audio") {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = URL.createObjectURL(blob);
    preview.append(audio);
  } else if (type === "text" && entry.size <= 256 * 1024) {
    preview.append(element("pre", "", new TextDecoder().decode(entry.data)));
  } else {
    preview.append(element("p", "form-hint", "二进制文件可替换、删除或随 PCK 重新打包。"));
  }
}

function align4(value) {
  return (value + 3) & ~3;
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function importLocalGameAssetPacks(file, slots, feedback) {
  const text = await file.text();
  const payload = JSON.parse(text);
  const packs = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.assetPacks)
      ? payload.assetPacks
      : payload.pack
        ? [payload.pack]
        : [];

  if (!packs.length) {
    throw new Error("文件里没有 assetPacks 数组。");
  }

  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const imported = [];

  for (const pack of packs) {
    const nextPack = {
      ...pack,
      id: String(pack.id || `local-pack-${Date.now()}`),
      name: String(pack.name || "本地素材包"),
      builtin: false,
      enabled: pack.enabled !== false,
      assets: { ...(pack.assets || {}) },
      updatedAt: new Date().toISOString()
    };

    for (const [slotId, asset] of Object.entries(nextPack.assets)) {
      const slot = slotMap.get(slotId);
      const dataUrl = typeof asset === "string" ? asset : asset?.dataUrl;

      if (!slot || !dataUrl || !String(dataUrl).startsWith("data:")) {
        continue;
      }

      feedback.textContent = `上传本地素材：${slot.label}…`;
      const uploadFile = dataUrlToFile(dataUrl, asset?.name || defaultAssetFilename(slot));
      const form = new FormData();
      form.append("slotId", slot.id);
      form.append("file", uploadFile);
      const result = await adminGameUpload("/api/admin/game/assets", form);
      nextPack.assets[slotId] = result.asset;
    }

    imported.push(nextPack);
  }

  return imported;
}

function templateAssetForSlot(slot) {
  if (slot.kind === "audio") {
    return { dataUrl: "data:audio/ogg;base64,...", name: defaultAssetFilename(slot) };
  }
  if (slot.kind === "bundle") {
    return { dataUrl: "data:application/octet-stream;base64,...", name: defaultAssetFilename(slot) };
  }
  return { dataUrl: "data:image/png;base64,...", name: defaultAssetFilename(slot) };
}

function defaultAssetFilename(slot) {
  const extension = slot.kind === "audio" ? "ogg" : slot.kind === "bundle" ? "pck" : "png";
  return `${slot.id}.${extension}`;
}

function findFirstAssetForSlot(textareaValue, slotId) {
  try {
    const assetPacks = JSON.parse(textareaValue || "[]");
    for (const pack of assetPacks) {
      const asset = pack?.assets?.[slotId];
      if (asset?.url) return asset;
    }
  } catch {
    return null;
  }
  return null;
}

function dataUrlToFile(dataUrl, name) {
  const [header, base64] = String(dataUrl).split(",");
  if (!header || !base64) {
    throw new Error("无效 Data URL。");
  }
  const contentType = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], name, { type: contentType });
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderGameDataEditor(config) {
  const panel = element("div", "game-editor-card game-level-editor");
  panel.dataset.gameEditor = "levels";
  let levels = structuredClone(config.levels || []);
  const textarea = document.createElement("textarea");
  textarea.className = "input game-json-editor";
  textarea.value = JSON.stringify(levels, null, 2);
  const save = button("保存游戏数据", "button primary", "button");
  const exportButton = button("导出游戏数据", "button", "button");
  const importLabel = element("label", "button game-import-button", "导入游戏数据");
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importLabel.append(importInput);
  const feedback = element("p", "form-hint", "");

  function readLevelsFromTextarea() {
    levels = JSON.parse(textarea.value || "[]");
  }

  exportButton.addEventListener("click", () => {
    try {
      readLevelsFromTextarea();
      downloadJson("llr-mariorun-game-data-" + Date.now() + ".json", { version: 1, exportedAt: new Date().toISOString(), levels });
      feedback.textContent = "已导出游戏数据 JSON。";
    } catch (error) {
      feedback.textContent = "导出失败：" + error.message;
    }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      levels = Array.isArray(payload) ? payload : Array.isArray(payload.levels) ? payload.levels : [];
      if (!levels.length) throw new Error("文件里没有 levels 数组。");
      textarea.value = JSON.stringify(levels, null, 2);
      feedback.textContent = "已导入 " + levels.length + " 条游戏数据，确认后点“保存游戏数据”。";
    } catch (error) {
      feedback.textContent = "导入失败：" + error.message;
    } finally {
      importInput.value = "";
    }
  });

  save.addEventListener("click", async () => {
    try {
      readLevelsFromTextarea();
      await adminGameRequest("/api/admin/game/levels", { method: "PUT", body: JSON.stringify({ levels }) });
      feedback.textContent = "游戏数据已保存。";
    } catch (error) {
      feedback.textContent = "保存失败：" + error.message;
    }
  });

  const tools = element("div", "game-editor-tools");
  tools.append(importLabel, exportButton);
  panel.append(element("h4", "", "游戏数据保存"), element("p", "form-hint", "关卡和存档编辑已放到游戏内完成；这里仅保存或导入/导出游戏内产生的 JSON 数据，不再提供网页外关卡设计器。"), tools, textarea, save, feedback);
  return panel;
}
async function adminGameRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.token}`,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

async function adminGameUpload(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${state.token}`
    },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function renderAdminPasswordSettings() {
  const section = element("section", "announcement-settings");
  section.append(element("h3", "", "管理员密码"));
  const form = element("form", "password-form");
  const row = element("div", "admin-row");
  const current = document.createElement("input");
  current.className = "input";
  current.type = "password";
  current.placeholder = "当前密码";
  current.autocomplete = "current-password";
  current.required = true;
  const next = document.createElement("input");
  next.className = "input";
  next.type = "password";
  next.placeholder = "新密码（至少 4 位）";
  next.autocomplete = "new-password";
  next.required = true;
  next.minLength = 4;
  row.append(current, next);
  const actions = element("div", "module-actions");
  const save = button("修改密码", "button primary", "submit");
  const feedback = element("p", "form-hint");
  actions.append(save);
  form.append(row, actions, feedback);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    save.textContent = "修改中";
    feedback.textContent = "";

    try {
      const payload = await api.postJson("/api/admin/password", {
        currentPassword: current.value,
        newPassword: next.value
      }, true);
      state.token = payload.token;
      localStorage.setItem(adminTokenKey, state.token);
      current.value = "";
      next.value = "";
      feedback.textContent = "密码已修改，下次登录请使用新密码。";
    } catch (error) {
      feedback.textContent = error.message;
    }

    save.disabled = false;
    save.textContent = "修改密码";
  });
  section.append(form);
  section.append(element("p", "form-hint", "默认密码现在是 admin。后台修改后会保存在 Cloudflare KV 中。"));

  const limitedForm = element("form", "password-form");
  limitedForm.append(element("h3", "", "低权限密码"));
  const limitedRow = element("div", "admin-row");
  const adminPassword = document.createElement("input");
  adminPassword.className = "input";
  adminPassword.type = "password";
  adminPassword.placeholder = "当前管理员密码";
  adminPassword.autocomplete = "current-password";
  adminPassword.required = true;
  const limitedPassword = document.createElement("input");
  limitedPassword.className = "input";
  limitedPassword.type = "password";
  limitedPassword.placeholder = "新的低权限密码（至少 4 位）";
  limitedPassword.autocomplete = "new-password";
  limitedPassword.required = true;
  limitedPassword.minLength = 4;
  limitedRow.append(adminPassword, limitedPassword);
  const limitedActions = element("div", "module-actions");
  const limitedSave = button("修改低权限密码", "button", "submit");
  const limitedFeedback = element("p", "form-hint");
  limitedActions.append(limitedSave);
  limitedForm.append(limitedRow, limitedActions, limitedFeedback);
  limitedForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    limitedSave.disabled = true;
    limitedSave.textContent = "修改中";
    limitedFeedback.textContent = "";

    try {
      await api.postJson("/api/admin/limited-password", {
        currentPassword: adminPassword.value,
        newPassword: limitedPassword.value
      }, true);
      adminPassword.value = "";
      limitedPassword.value = "";
      limitedFeedback.textContent = "低权限密码已修改，可在同一个登录页使用。";
    } catch (error) {
      limitedFeedback.textContent = error.message;
    }

    limitedSave.disabled = false;
    limitedSave.textContent = "修改低权限密码";
  });
  section.append(limitedForm);
  section.append(element("p", "form-hint", "低权限默认密码是 limited，只能添加和移动模块。"));
  return section;
}

function renderCommentBlockWordsSettings() {
  const section = element("section", "announcement-settings");
  section.append(element("h3", "", "评论屏蔽词"));
  section.append(
    areaField("屏蔽词列表", (state.config.commentBlockWords || []).join("\n"), (value) => {
      state.config.commentBlockWords = normalizeBlockWordsInput(value);
    }, "每行一个词。评论名字或内容出现这些词时，将无法发送，并记录 IP、内容和命中词到访问日志。")
  );
  return section;
}

function renderPreviewEditor(page) {
  const limited = isLimitedAdmin();
  const pageLockedForLimited = limited && page.locked;
  if (state.adminTab === "settings") {
    if (pageLockedForLimited) return element("p", "empty-state", "此页面已锁定，你暂时没有编辑权限。");
    return renderPageSettings(page);
  }
  if (state.adminTab === "appearance") {
    if (pageLockedForLimited) return element("p", "empty-state", "此页面已锁定，你暂时没有编辑权限。");
    return renderEntrySettings(page);
  }
  const panel = element("section", "admin-panel preview-editor");
  if (pageLockedForLimited) {
    panel.append(element("p", "empty-state", "此页面已锁定，你暂时没有编辑权限。"));
    return panel;
  }
  if (page.kind === "blog") {
    const blog = hydrateBlogSection(page.blog);
    page.blog = blog;
    panel.append(renderEditableBlogSection(blog));
    return panel;
  }
  const head = sectionHeading("内容模块", "选一种内容，直接添加到页面底部；模块会自动展开，编辑完成后再调整顺序。");
  head.classList.add("content-module-heading");
  head.append(element("span", "count-badge", `${page.sections.length} 个模块`));
  const canvas = element("div", "page-preview");
  canvas.append(renderEditablePageHeader(page), renderModuleAddToolbar(page));
  if (page.sections.length) {
    const sectionList = element("div", "page-section-list");
    page.sections.forEach((section, index) => {
      sectionList.append(renderEditableSection(page, section, index));
    });
    canvas.append(sectionList);
  }
  if (!page.sections.length) {
    const empty = element("div", "editor-empty-state");
    empty.append(icon("grid"), element("h3", "", "这页还没有内容"), element("p", "", "从上面的内容类型开始，模块会自动放到页面底部。"));
    canvas.append(empty);
  }
  panel.append(head, canvas);
  return panel;
}

function renderExternalLinkEditor(link) {
  const region = element("div", "external-editor-layout");
  const panel = element("section", "admin-panel external-link-editor");
  panel.append(sectionHeading("入口信息", "名称和说明会展示在首页卡片与导航中。"));
  const preview = renderExternalLinkPreview(link);
  const refreshPreview = () => {
    const previous = preview.querySelector(".entry-card");
    previous?.replaceWith(renderExternalLinkEntry(link));
  };
  panel.append(field("入口名称", link.title, value => { link.title = value; refreshPreview(); }), field("目标网址", link.targetUrl, value => { link.targetUrl = value.trim(); refreshPreview(); }, "填写完整网站地址，或本站的 /路径。"), areaField("入口说明", link.description, value => { link.description = value; refreshPreview(); }), checkbox("在首页和导航中展示", link.visible, checked => { link.visible = checked; renderAdminEditor(); }));
  const appearance = element("section", "admin-panel");
  appearance.append(sectionHeading("图标与封面", "让访客一眼认出这个入口。"));
  appearance.append(field("图标文字", link.iconText, value => { link.iconText = normalizeExternalLinkIconTextInput(value); refreshPreview(); }, `最多 ${externalLinkIconTextMaxLength} 个字符；没有自定义图片时显示。`, { maxLength: externalLinkIconTextMaxLength, normalize: normalizeExternalLinkIconTextInput }), compactImageValueField("自定义图标", link.iconImage, value => { link.iconImage = value; refreshPreview(); }), compactImageValueField("入口封面", link.backgroundImage, value => { link.backgroundImage = value; refreshPreview(); }));
  const aside = element("aside", "admin-panel entry-live-preview");
  aside.append(sectionHeading("首页展示预览", "保存后，访客会看到这样的入口。"), preview);
  const remove = withIcon(button("删除入口", "button danger", "button"), "trash");
  remove.addEventListener("click", () => deleteExternalLink(link));
  aside.append(remove);
  region.append(panel, aside, appearance);
  return region;
}

function renderExternalLinkPreview(link) {
  const wrapper = element("div", "entry-preview-wrap");
  wrapper.append(element("span", "field-title", "入口预览"));
  wrapper.append(renderExternalLinkEntry(link));
  return wrapper;
}

function renderAccessLogsPanel() {
  const panel = element("section", "admin-panel access-logs-panel");
  const head = element("div", "section-head action-head");
  const copy = element("div");
  copy.append(element("h2", "", "访问日志"));
  copy.append(element("p", "", "只记录普通访客打开网站页面的 IP、时间、路径和设备信息；管理员后台和接口操作不会记录。"));
  const actions = element("div", "module-actions");
  const refresh = button("刷新", "button", "button");
  const clear = button("清空日志", "button danger", "button");
  const list = element("div", "access-log-list");

  refresh.addEventListener("click", () => {
    loadAccessLogs(list);
  });

  clear.addEventListener("click", async () => {
    if (!(await confirmAction({ title: "清空全部访问记录？", description: "访问记录和评论拦截记录将被永久清空。", confirmLabel: "清空记录", destructive: true }))) {
      return;
    }

    clear.disabled = true;

    try {
      const payload = await api.postJson("/api/admin/logs", { action: "clear" }, true);
      renderAccessLogsList(list, payload.logs || []);
    } catch (error) {
      list.replaceChildren(element("p", "form-error", error.message));
    }

    clear.disabled = false;
  });

  actions.append(refresh, clear);
  head.append(copy, actions);
  panel.append(head, list);
  loadAccessLogs(list);
  return panel;
}

async function loadAccessLogs(list) {
  list.replaceChildren(element("p", "form-hint", "正在加载访问日志..."));

  try {
    const payload = await api.getJson("/api/admin/logs", true);
    renderAccessLogsList(list, payload.logs || []);
  } catch (error) {
    list.replaceChildren(element("p", "form-error", error.message));
  }
}

function renderAccessLogsList(list, logs) {
  if (!logs.length) {
    list.replaceChildren(element("p", "empty-state", "还没有访问记录。"));
    return;
  }

  list.replaceChildren(...logs.map((log) => {
    const item = element("article", "access-log-item");
    item.classList.toggle("is-blocked-comment", log.kind === "blocked-comment");
    const head = element("div", "comment-head");
    head.append(element("strong", "", log.kind === "blocked-comment" ? `评论拦截 · ${log.ip || "unknown"}` : log.ip || "unknown"));
    head.append(element("span", "comment-meta", formatDate(log.createdAt)));
    item.append(head);

    if (log.kind === "blocked-comment") {
      item.append(element("p", "", `页面 ${log.path || "/"} · 名称：${log.name || "访客"} · 命中：${log.matchedWord || "屏蔽词"}`));
      item.append(element("p", "blocked-comment-body", log.body || ""));
    } else {
      item.append(element("p", "", `${log.method || "GET"} ${log.path || "/"}`));
    }

    item.append(element("p", "form-hint", log.device || "未知设备"));
    return item;
  }));
}

function renderEditablePageHeader(page) {
  const header = element("section", "preview-page-header editable-page-header");
  const titleInput = document.createElement("input");
  titleInput.className = "inline-input inline-title-input";
  titleInput.value = page.title || "";
  titleInput.placeholder = "为页面起个名字";
  titleInput.setAttribute("aria-label", "页面标题");
  trackUndoOnEdit(titleInput);
  titleInput.addEventListener("input", () => { page.title = titleInput.value; markConfigDirty(); });
  const descriptionInput = document.createElement("textarea");
  descriptionInput.className = "inline-input inline-description-input";
  descriptionInput.value = page.description || "";
  descriptionInput.placeholder = "添加简短说明，让访客更了解这一页。";
  descriptionInput.setAttribute("aria-label", "页面说明");
  descriptionInput.rows = 2;
  trackUndoOnEdit(descriptionInput);
  descriptionInput.addEventListener("input", () => { page.description = descriptionInput.value; markConfigDirty(); });
  const path = element("span", "editor-page-path", `/${page.slug}`);
  path.prepend(icon("link"));
  header.append(path, titleInput, descriptionInput);
  return header;
}

function renderEntrySettings(page) {
  return renderModernEntryEditor(page);
}

function renderModernEntryEditor(page) {
  const limited = isLimitedAdmin();
  const panel = element("section", "entry-settings modern-entry-settings");
  const head = element("div", "section-head");
  head.append(element("h2", "", "入口与页面外观"));
  head.append(element("p", "", "为首页入口与分页面选择图标和背景，文字可以直接在预览里编辑。"));

  const layout = element("div", "modern-entry-layout");
  const preview = element("article", "module-card entry-card editable-entry-preview");
  applyEntryCardStyle(preview, page.entry.backgroundImage);
  const previewHeader = element("header", "module-card-header no-toggle");
  previewHeader.append(entryMark(page.entry));
  const previewText = element("div", "editable-entry-copy");
  const titleInput = document.createElement("input");
  titleInput.className = "editable-card-title";
  titleInput.value = page.entry.title || "";
  titleInput.placeholder = page.title || "入口标题";
  titleInput.setAttribute("aria-label", "入口标题");
  trackUndoOnEdit(titleInput);
  titleInput.addEventListener("input", () => {
    page.entry.title = titleInput.value;
    markConfigDirty();
  });
  const descriptionInput = document.createElement("textarea");
  descriptionInput.className = "editable-card-description";
  descriptionInput.value = page.entry.description || "";
  descriptionInput.placeholder = page.description || "入口说明";
  descriptionInput.rows = 2;
  descriptionInput.setAttribute("aria-label", "入口说明");
  trackUndoOnEdit(descriptionInput);
  descriptionInput.addEventListener("input", () => {
    page.entry.description = descriptionInput.value;
    markConfigDirty();
  });
  previewText.append(titleInput, descriptionInput);
  previewHeader.append(previewText);
  preview.append(previewHeader, element("span", "button primary editable-entry-fake-button", "进入"));

  const settings = element("div", "modern-entry-side");
  settings.append(
    compactTextField("主页图标文字", page.entry.iconText, (value) => {
      page.entry.iconText = value.slice(0, 4).toUpperCase();
    }, "最多 4 个字，未上传图片时显示。")
  );
  settings.append(compactImageValueField("主页图标图片", page.entry.iconImage, (value) => {
    page.entry.iconImage = value;
  }));
  settings.append(compactImageValueField("入口卡片背景", page.entry.backgroundImage, (value) => {
    page.entry.backgroundImage = value;
  }, {
    onPreview: (value) => applyEntryCardStyle(preview, value)
  }));
  settings.append(compactImageValueField("分页面背景", page.backgroundImage, (value) => {
    page.backgroundImage = value;
  }, {
    hint: "影响前台分页面背景，保存后生效。"
  }));
  settings.append(checkbox("每日自动背景", page.dailyBackgroundEnabled, (checked) => {
    page.dailyBackgroundEnabled = checked;
    markConfigDirty();
  }));

  const sideDetails = document.createElement("details");
  sideDetails.className = "modern-settings-details";
  sideDetails.append(element("summary", "", "侧边栏单独设置"));
  const sideGrid = element("div", "modern-details-grid");
  sideGrid.append(
    compactTextField("侧边栏标题", page.entry.sidebarTitle, (value) => {
      page.entry.sidebarTitle = value;
    }, "留空时使用页面标题。"),
    compactAreaField("侧边栏说明", page.entry.sidebarDescription, (value) => {
      page.entry.sidebarDescription = value;
    }, "留空时显示网址后缀。"),
    compactTextField("侧边栏图标文字", page.entry.sidebarIconText, (value) => {
      page.entry.sidebarIconText = value.slice(0, 4).toUpperCase();
    }, "留空时跟随主页图标文字。"),
    compactImageValueField("侧边栏图标图片", page.entry.sidebarIconImage, (value) => {
      page.entry.sidebarIconImage = value;
    })
  );
  sideDetails.append(sideGrid);
  settings.append(sideDetails);

  layout.append(preview, settings);
  panel.append(head, layout);

  return panel;
}

function renderEntryPreview(page) {
  const wrapper = element("div", "entry-preview-wrap");
  wrapper.append(element("span", "field-title", "入口预览"));
  wrapper.append(renderPageEntry(page));
  return wrapper;
}

function renderBottomCommentsSettings(page) {
  const panel = element("section", "entry-settings comments-placement-settings modern-comments-settings");
  const head = element("div", "section-head");
  head.append(element("h2", "", "评论区"));
  head.append(element("p", "", "打开后访客可以在这个分页面留言；更多布局和管理项默认收起。"));
  const quickRow = element("div", "modern-comments-row");
  quickRow.append(
    checkbox("在页面底部显示评论区", page.comments.enabled, (checked) => {
      page.comments.enabled = checked;
      renderAdminEditor();
    })
  );
  quickRow.append(element("span", "modern-comments-status", page.comments.enabled ? "已开启" : "已关闭"));
  panel.append(head, quickRow);

  if (page.comments.enabled) {
    const copyGrid = element("div", "modern-comments-copy");
    copyGrid.append(
      compactTextField("标题", page.comments.title, (value) => {
        page.comments.title = value;
      }),
      compactAreaField("说明", page.comments.description, (value) => {
        page.comments.description = value;
      })
    );
    panel.append(copyGrid);
  }

  const advanced = document.createElement("details");
  advanced.className = "comments-advanced-details modern-settings-details";
  advanced.append(element("summary", "", "评论展示和管理"));
  const advancedGrid = element("div", "modern-details-grid");
  advancedGrid.append(
    selectField(
      "展示方式",
      page.comments.mode,
      [
        ["bottom", "底部独立区域"],
        ["module", "和其它模块一样"]
      ],
      (value) => {
        page.comments.mode = value;
        renderAdminEditor();
      }
    ),
    numberField("列表高度(px)", page.comments.listHeight, 180, 900, 20, (value) => {
      page.comments.listHeight = value;
      renderAdminEditor();
    })
  );
  advanced.append(advancedGrid);

  if (page.comments.enabled && page.comments.mode === "module") {
    advanced.append(renderLayoutSettings(page.comments, "评论模块布局"));
  }

  if (!isLimitedAdmin()) {
    advanced.append(renderCommentsManager(page));
  }
  panel.append(advanced);
  return panel;
}

function getSectionChoices() {
  return [
    { type: "text", symbol: "text", title: "文字", description: "正文、说明和日常记录", create: createTextSection },
    { type: "image", symbol: "image", title: "图片", description: "照片、插图和视觉内容", create: createImageSection },
    { type: "video", symbol: "video", title: "视频", description: "上传视频并添加介绍", create: createVideoSection },
    { type: "system", symbol: "grid", title: "实用工具", description: "便签、计算器、计时器等", create: createSystemSection },
    { type: "link", symbol: "link", title: "网站卡片", description: "分享一个值得收藏的网站", create: createLinkSection },
    { type: "navigation", symbol: "list", title: "导航列表", description: "把常用网址整理在一起", create: createNavigationSection },
    { type: "article", symbol: "file", title: "文章入口", description: "展示站内的一篇文章", create: createArticleSection },
    { type: "blog", symbol: "blog", title: "博客", description: "在页面里展示一组文章", create: createBlogSection },
    { type: "comments", symbol: "message", title: "留言区", description: "给访客一个交流的地方", create: createCommentsSection }
  ];
}

function renderModuleAddToolbar(page) {
  const toolbar = element("section", "module-add-toolbar");
  const copy = element("div", "module-add-toolbar-copy");
  copy.append(element("h3", "", "添加内容"), element("p", "", "点击一种类型，它会直接加入这页底部并打开编辑。"));
  const hint = element("span", "module-add-toolbar-hint", "按添加顺序排列");
  const head = element("div", "module-add-toolbar-head");
  head.append(copy, hint);

  const grid = element("div", "module-add-grid");
  for (const choice of getSectionChoices()) {
    const add = button("", "module-add-card", "button");
    add.dataset.moduleType = choice.type;
    add.setAttribute("aria-label", `添加${choice.title}模块`);
    const mark = element("span", "module-add-card-icon");
    mark.append(icon(choice.symbol));
    const text = element("span", "module-add-card-copy");
    text.append(element("strong", "", choice.title), element("small", "", choice.description));
    add.append(mark, text, icon("plus", "module-add-card-plus"));
    add.addEventListener("click", () => insertSection(page, page.sections.length, choice.create()));
    grid.append(add);
  }

  toolbar.append(head, grid);
  return toolbar;
}

function renderEditableSection(page, section, index) {
  const shell = element("section", `editable-section editable-${section.type}`);
  const expanded = state.expandedSections.has(section.id);
  const locked = Boolean(section.layout?.locked);
  const limitedLocked = isLimitedAdmin() && (page.locked || locked);
  shell.classList.toggle("is-locked", locked);
  shell.classList.toggle("is-collapsed", !expanded);
  shell.dataset.sectionId = section.id;
  shell.append(renderSectionControls(page, section, index, expanded));
  if (expanded && !limitedLocked) {
    let editor;
    if (section.type === "system") editor = renderEditableSystemSection(page, section);
    else if (section.type === "image") editor = renderEditableImageSection(section);
    else if (section.type === "video") editor = renderEditableVideoSection(section);
    else if (section.type === "p2p") editor = renderEditableP2PSection(section);
    else if (section.type === "link") editor = renderEditableLinkSection(section);
    else if (section.type === "navigation") editor = renderEditableNavigationSection(section);
    else if (section.type === "article") editor = renderEditableArticleSection(section);
    else if (section.type === "blog") editor = renderEditableBlogSection(section);
    else if (section.type === "comments") editor = renderEditableCommentsSection(page, section);
    else editor = renderEditableTextSection(section);
    const body = element("div", "section-editor-content");
    body.append(editor);
    const layout = document.createElement("details");
    layout.className = "modern-settings-details module-layout-details";
    layout.append(element("summary", "", "布局与编辑权限"), renderLayoutSettings(section, "模块布局", page, index));
    body.append(layout);
    shell.append(body);
  } else {
    const description = limitedLocked ? "这个模块已锁定，你暂时没有编辑权限。" : section.description || section.body || section.title || (section.type === "navigation" ? `${section.items?.length || 0} 个网址` : "点击展开，编辑模块内容与展示方式。");
    shell.append(element("p", "section-collapsed-summary", description));
  }
  return shell;
}

function renderSectionControls(page, section, index, expanded) {
  const controls = element("div", "section-controls");
  const locked = Boolean(section.layout?.locked);
  const limitedLocked = isLimitedAdmin() && (page.locked || locked);
  const copy = element("div", "section-control-copy");
  copy.append(element("span", "section-index", String(index + 1).padStart(2, "0")), element("strong", "", sectionLabel(section)));
  if (locked) copy.append(icon("lock"));
  const toggle = withIcon(button(expanded ? "收起" : "编辑", "section-toggle", "button"), expanded ? "up" : "down");
  toggle.disabled = limitedLocked;
  toggle.setAttribute("aria-label", `${expanded ? "收起" : "编辑"}${sectionLabel(section)}`);
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.addEventListener("click", () => {
    if (expanded) state.expandedSections.delete(section.id);
    else state.expandedSections.add(section.id);
    renderAdminEditor();
  });
  const tools = element("div", "section-tools");
  const up = withIcon(button("", "icon-button", "button"), "up");
  up.setAttribute("aria-label", "上移模块");
  up.title = "上移模块";
  up.disabled = limitedLocked || index === 0;
  up.addEventListener("click", () => moveSection(page, index, -1));
  const down = withIcon(button("", "icon-button", "button"), "down");
  down.setAttribute("aria-label", "下移模块");
  down.title = "下移模块";
  down.disabled = limitedLocked || index === page.sections.length - 1;
  down.addEventListener("click", () => moveSection(page, index, 1));
  const duplicate = withIcon(button("", "icon-button", "button"), "copy");
  duplicate.setAttribute("aria-label", "复制模块");
  duplicate.title = "复制模块";
  duplicate.disabled = limitedLocked;
  duplicate.addEventListener("click", () => duplicateSection(page, index));
  const remove = withIcon(button("", "icon-button danger", "button"), "trash");
  remove.setAttribute("aria-label", "删除模块");
  remove.title = "删除模块";
  remove.disabled = limitedLocked;
  remove.addEventListener("click", async () => {
    if (!(await confirmAction({ title: `删除${sectionLabel(section)}模块？`, description: "删除后可在保存前使用撤销恢复。", confirmLabel: "删除模块", destructive: true }))) return;
    rememberConfigChange();
    page.sections.splice(index, 1);
    state.expandedSections.delete(section.id);
    renderAdminEditor();
  });
  tools.append(duplicate, up, down, remove, toggle);
  controls.append(copy, tools);
  return controls;
}

function renderLayoutSettings(target, title, page = null, index = -1) {
  const limited = isLimitedAdmin();
  const layoutType = target.type || "comments";
  target.layout = hydrateLayout(target.layout, layoutType);
  const panel = element("section", "layout-settings");
  panel.append(element("h3", "", title));
  const row = element("div", "admin-row");
  row.append(
    numberField("宽度(%，0为自动)", target.layout.width, 0, 100, 5, (value) => {
      target.layout.width = value;
      renderAdminEditor();
    })
  );
  row.append(
    numberField("最小高度(px)", target.layout.minHeight, 120, 900, 20, (value) => {
      target.layout.minHeight = value;
      renderAdminEditor();
    })
  );
  panel.append(row);

  const controlRow = element("div", "admin-row");

  if (page) {
    controlRow.append(
      numberField("位置序号", index + 1, 1, page.sections.length, 1, (value) => {
        moveSectionTo(page, index, value - 1);
      })
    );
  } else {
    controlRow.append(element("p", "form-hint", "底部独立区域不占用模块网格位置。"));
  }

  if (!limited) {
    controlRow.append(
      checkbox("锁定模块（限制低权限）", target.layout.locked, (checked) => {
        target.layout.locked = checked;
        renderAdminEditor();
      })
    );
  }
  panel.append(controlRow);
  return panel;
}

function renderEditableSystemSection(page, section) {
  const editor = element("div", "preview-section-body");
  editor.append(
    selectField(
      "系统模块",
      section.moduleId,
      state.modules.map((module) => [module.id, module.name]),
      (value) => {
        section.moduleId = value;
        renderAdminEditor();
      }
    )
  );

  const module = state.modules.find((item) => item.id === section.moduleId);

  if (module) {
    editor.append(renderModuleCard(module, moduleContext(page)));
  } else {
    editor.append(element("p", "empty-state", "请选择一个系统模块。"));
  }

  return editor;
}

function renderEditableTextSection(section) {
  const card = element("article", "module-card inline-editor-card");
  const row = element("div", "admin-row");
  row.append(
    field("图标", section.icon, (value) => {
      section.icon = value.slice(0, 3).toUpperCase();
    })
  );
  row.append(
    field("模块标题", section.title, (value) => {
      section.title = value;
    })
  );
  card.append(row);
  card.append(
    field("模块说明", section.description, (value) => {
      section.description = value;
    })
  );
  card.append(
    areaField("正文", section.body, (value) => {
      section.body = value;
    })
  );
  return card;
}

function renderEditableImageSection(section) {
  const card = element("article", "module-card inline-editor-card image-editor-card");
  const controls = element("div", "admin-row");
  controls.append(field("图片标题", section.title, value => { section.title = value; }), selectField("显示方式", section.display, [["normal", "正常图片"], ["background", "展示图片"]], value => { section.display = value; renderAdminEditor(); }));
  const meta = element("div", "admin-row");
  meta.append(selectField("填充方式", section.fit, [["cover", "铺满"], ["contain", "完整显示"]], value => { section.fit = value; }), field("替代文字", section.alt, value => { section.alt = value; }, "向无法查看图片的访客描述图片内容。"), field("图片注释", section.caption, value => { section.caption = value; }));
  card.append(controls, field("图片说明", section.description, value => { section.description = value; }), compactImageValueField("模块图片", section.src, value => { section.src = value; }, { hint: "上传图片会自动压缩，也可以填写图片地址。" }), meta);
  return card;
}

function renderEditableVideoSection(section) {
  const card = element("article", "module-card inline-editor-card video-editor-card");
  const row = element("div", "admin-row");
  row.append(
    field("视频标题", section.title, (value) => {
      section.title = value;
    })
  );
  row.append(
    field("视频地址", section.src, (value) => {
      section.src = value.trim();
    }, "粘贴 mp4/webm/ogg 等浏览器可播放的视频地址。")
  );
  card.append(row);
  card.append(
    field("视频说明", section.description, (value) => {
      section.description = value;
    })
  );
  const meta = element("div", "admin-row");
  meta.append(videoUploadField(section));
  meta.append(
    field("封面图片", section.poster, (value) => {
      section.poster = value.trim();
    }, "可选，未播放前显示。")
  );
  meta.append(
    field("视频注释", section.caption, (value) => {
      section.caption = value;
    })
  );
  card.append(meta);
  card.append(renderVideoSection(section));
  return card;
}

function renderEditableP2PSection(section) {
  const card = element("article", "module-card inline-editor-card p2p-editor-card");
  const row = element("div", "admin-row");
  row.append(
    field("模块标题", section.title, (value) => {
      section.title = value;
    })
  );
  row.append(
    field("房间号", section.room, (value) => {
      section.room = normalizeRoomId(value);
    }, "同一个房间号的人会进入同一个传输房间。")
  );
  card.append(row);
  card.append(
    field("模块说明", section.description, (value) => {
      section.description = value;
    })
  );
  card.append(renderP2PEntrySection(section));
  return card;
}

function renderEditableLinkSection(section) {
  const card = element("article", "module-card inline-editor-card link-editor-card");
  const row = element("div", "admin-row");
  row.append(
    field("网站标题", section.title, (value) => {
      section.title = value;
    })
  );
  row.append(
    field("目标网址", section.targetUrl, (value) => {
      section.targetUrl = value.trim();
    }, "可以填完整 https:// 地址，也可以直接填域名。")
  );
  card.append(row);
  card.append(
    field("网站说明", section.description, (value) => {
      section.description = value;
    }, "留空时会显示目标域名。")
  );

  const iconRow = element("div", "admin-row");
  iconRow.append(
    field("图标文字", section.iconText, (value) => {
      section.iconText = value.slice(0, 4).toUpperCase();
    }, "没有手动图标时，会自动尝试显示目标网站图标。")
  );
  iconRow.append(imageValueField("手动图标图片", section.iconImage, (value) => {
    section.iconImage = value;
  }));
  card.append(iconRow);

  const backgroundRow = element("div", "admin-row");
  backgroundRow.append(imageValueField("模块背景", section.backgroundImage, (value) => {
    section.backgroundImage = value;
  }));
  backgroundRow.append(renderLinkSectionPreview(section));
  card.append(backgroundRow);
  return card;
}

function renderEditableNavigationSection(section) {
  const card = element("article", "module-card inline-editor-card navigation-editor-card");
  card.append(
    field("导航标题", section.title, (value) => {
      section.title = value;
      markConfigDirty();
    })
  );

  const list = element("div", "navigation-editor-list");
  section.items.forEach((item, index) => {
    const row = element("div", "navigation-editor-row");
    row.append(
      field("名称", item.name, (value) => {
        item.name = value;
        markConfigDirty();
      }),
      field("网址", item.url, (value) => {
        item.url = value;
        markConfigDirty();
      }, "支持完整网址或域名。")
    );

    const tools = element("div", "navigation-editor-tools");
    const up = button("上移", "button", "button");
    up.disabled = index === 0;
    up.addEventListener("click", () => moveNavigationItem(section, index, -1));
    const down = button("下移", "button", "button");
    down.disabled = index === section.items.length - 1;
    down.addEventListener("click", () => moveNavigationItem(section, index, 1));
    const remove = button("删除", "button danger", "button");
    remove.addEventListener("click", () => {
      rememberConfigChange();
      section.items.splice(index, 1);
      renderAdminEditor();
    });
    tools.append(up, down, remove);
    row.append(tools);
    list.append(row);
  });
  card.append(list);

  const add = button("添加网址", "button primary", "button");
  add.disabled = section.items.length >= 100;
  add.addEventListener("click", () => {
    rememberConfigChange();
    section.items.push({ id: crypto.randomUUID(), name: "新网站", url: "" });
    renderAdminEditor();
  });
  card.append(add);
  return card;
}

function moveNavigationItem(section, index, offset) {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= section.items.length) {
    return;
  }

  rememberConfigChange();
  const [item] = section.items.splice(index, 1);
  section.items.splice(nextIndex, 0, item);
  renderAdminEditor();
}

function renderEditableArticleSection(section) {
  const card = element("article", "module-card inline-editor-card");
  card.append(
    field("文章路径", section.articlePath, (value) => {
      section.articlePath = normalizeArticlePath(value);
    }, "例如 /blog/文章ID，保存后会自动同步标题、简介和封面。"),
    renderArticleSection(section)
  );
  return card;
}

function renderEditableBlogSection(section) {
  const card = element("article", "module-card inline-editor-card blog-editor-card");
  const head = element("div", "blog-editor-heading");
  const copy = element("div");
  copy.append(element("h2", "", "文章管理"), element("p", "", `${section.articles.length} 篇文章 · 点击展开编辑，保存后更新到网站。`));
  const add = withIcon(button("新建文章", "button primary", "button"), "plus");
  add.addEventListener("click", () => {
    rememberConfigChange();
    const now = new Date().toISOString();
    const article = {
      id: crypto.randomUUID(), title: "新文章", summary: "", body: "", bodyHtml: "", coverImage: "", category: section.categories?.[0] || "随笔", tags: [],
      authorRole: isLimitedAdmin() ? "limited" : "admin", authorName: isLimitedAdmin() ? "limited" : "admin", createdAt: now, updatedAt: now, featured: false
    };
    section.articles.unshift(article);
    state.openArticleId = article.id;
    renderAdminEditor();
  });
  head.append(copy, add);
  const search = element("label", "search-field article-admin-search");
  search.append(icon("search"));
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "搜索文章标题或分类";
  input.setAttribute("aria-label", "搜索文章标题或分类");
  search.append(input);
  const articles = element("div", "blog-article-editor-list");
  const empty = element("p", "empty-state", section.articles.length ? "没有找到匹配的文章。" : "还没有文章，从第一篇记录开始吧。");
  empty.hidden = section.articles.length > 0;
  for (const article of section.articles) {
    const editor = renderEditableBlogArticle(section, article, articles);
    editor.dataset.searchText = `${article.title} ${article.category}`.toLocaleLowerCase();
    articles.append(editor);
    if (article.id === state.openArticleId) editor.open = true;
  }
  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase();
    const editors = [...articles.children];
    for (const editor of editors) editor.hidden = !editor.dataset.searchText.includes(query);
    empty.hidden = editors.some(editor => !editor.hidden);
  });
  const metadata = document.createElement("details");
  metadata.className = "modern-settings-details blog-editor-metadata";
  metadata.append(element("summary", "", "博客栏目与作者信息"));
  const settings = element("div", "modern-details-grid");
  settings.append(field("博客标题", section.title, value => { section.title = value; }), field("分类（逗号分隔）", (section.categories || []).join(", "), value => { section.categories = splitTags(value).slice(0, 20); }), areaField("博客说明", section.description, value => { section.description = value; }), field("栏目公告", section.notice, value => { section.notice = value; }), field("作者名称", section.profileName, value => { section.profileName = value; }), compactImageValueField("作者头像", section.profileImage, value => { section.profileImage = value; }), areaField("作者介绍", section.profileDescription, value => { section.profileDescription = value; }));
  metadata.append(settings);
  card.append(head, search, articles, empty, metadata);
  return card;
}


function renderEditableBlogArticle(section, article, listNode = null) {
  const locked = isLimitedAdmin() && article.authorRole === "admin";
  const item = element("details", locked ? "blog-article-editor is-readonly" : "blog-article-editor");
  item.dataset.articleId = article.id;
  const summary = element("summary", "blog-article-editor-summary");
  const dragHandle = element("span", "blog-article-drag-handle", "⋮⋮");
  dragHandle.title = locked ? "" : "拖拽调整文章顺序";
  dragHandle.draggable = !locked;
  const heading = element("div", "blog-article-editor-heading");
  heading.append(
    element("h3", "", article.title || "未命名文章"),
    element("p", "form-hint", locked ? "admin 发布，仅 admin 可以编辑。" : `作者：${article.authorName || article.authorRole} · ${formatDateTime(article.updatedAt || article.createdAt)}`)
  );
  const toggleLabel = element("span", "blog-article-expand-label", "展开编辑");
  summary.append(dragHandle, heading, toggleLabel);
  item.append(summary);

  if (!locked) {
    dragHandle.addEventListener("click", (event) => event.preventDefault());
    dragHandle.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/blog-article-id", article.id);
      item.classList.add("is-dragging");
    });
    dragHandle.addEventListener("dragend", () => {
      item.classList.remove("is-dragging");
      for (const node of listNode?.querySelectorAll(".blog-article-editor") || []) {
        node.classList.remove("is-drop-target");
      }
    });
    item.addEventListener("dragover", (event) => {
      if (!event.dataTransfer.types.includes("text/blog-article-id")) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      item.classList.add("is-drop-target");
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("is-drop-target");
    });
    item.addEventListener("drop", (event) => {
      const sourceId = event.dataTransfer.getData("text/blog-article-id");
      if (!sourceId) {
        return;
      }
      event.preventDefault();
      item.classList.remove("is-drop-target");
      reorderBlogArticle(section, sourceId, article.id);
    });
  }
  let editorBuilt = false;
  item.addEventListener("toggle", () => {
    if (item.isConnected) {
      if (item.open) state.openArticleId = article.id;
      else if (state.openArticleId === article.id) state.openArticleId = "";
    }
    toggleLabel.textContent = item.open ? "收起" : "展开编辑";
    if (!item.open || editorBuilt) return;
    editorBuilt = true;
    item.append(buildBlogArticleEditorBody(section, article, locked));
  });

  return item;
}

function buildBlogArticleEditorBody(section, article, locked) {
  const body = element("div", "blog-article-editor-body");
  const touch = () => {
    article.updatedAt = new Date().toISOString();
    const item = body.closest(".blog-article-editor");
    const heading = item?.querySelector(".blog-article-editor-heading h3");
    if (heading) heading.textContent = article.title || "未命名文章";
    if (item) item.dataset.searchText = `${article.title} ${article.category}`.toLocaleLowerCase();
    markConfigDirty();
  };
  const row = element("div", "admin-row");
  row.append(
    field("文章标题", article.title, (value) => {
      if (locked) return;
      article.title = value;
      touch();
    }),
    field("分类", article.category, (value) => {
      if (locked) return;
      article.category = value;
      touch();
    })
  );
  body.append(
    row,
    field("摘要", article.summary, (value) => {
      if (locked) return;
      article.summary = value;
      touch();
    }),
    imageValueField("封面图片", article.coverImage, (value) => {
      if (locked) return;
      article.coverImage = value;
      touch();
    }),
    field("标签（逗号分隔）", (article.tags || []).join(", "), (value) => {
      if (locked) return;
      article.tags = splitTags(value).slice(0, 12);
      touch();
    }),
    richTextEditorField("正文", articleBodyHtml(article), (value) => {
      if (locked) return;
      article.bodyHtml = value;
      article.body = htmlToPlainText(value);
      touch();
    }, locked)
  );

  const tools = element("div", "section-tools");
  const featured = checkbox("首页推荐", Boolean(article.featured), (checked) => {
    if (locked) return;
    article.featured = checked;
    touch();
  });
  const remove = button("删除文章", "button danger", "button");
  remove.disabled = locked;
  remove.addEventListener("click", async () => {
    if (!(await confirmAction({ title: `删除“${article.title || "未命名文章"}”？`, description: "文章会在保存后从网站移除。保存前可使用撤销恢复。", confirmLabel: "删除文章", destructive: true }))) return;
    rememberConfigChange();
    section.articles = section.articles.filter(item => item.id !== article.id);
    if (state.openArticleId === article.id) state.openArticleId = "";
    state.saveStatus = "文章已删除，保存后生效。";
    renderAdminEditor();
  });
  const order = element("div", "article-order-actions");
  for (const [delta, name, symbol] of [[-1, "上移文章", "up"], [1, "下移文章", "down"]]) {
    const move = withIcon(button("", "icon-button", "button"), symbol);
    move.setAttribute("aria-label", name);
    move.title = name;
    const target = section.articles[section.articles.indexOf(article) + delta];
    move.disabled = locked || !target || (isLimitedAdmin() && target.authorRole === "admin");
    move.addEventListener("click", () => { state.openArticleId = article.id; reorderBlogArticle(section, article.id, target.id); });
    order.append(move);
  }
  tools.append(featured, order, remove);
  body.append(tools);
  for (const control of body.querySelectorAll("input, textarea, select, button")) {
    if (locked && !control.classList.contains("rich-doc-tool")) control.disabled = true;
  }
  return body;
}

function renderLinkSectionPreview(section) {
  const wrapper = element("div", "entry-preview-wrap");
  wrapper.append(element("span", "field-title", "模块预览"));
  wrapper.append(renderLinkSection(section));
  return wrapper;
}

function renderEditableCommentsSection(page, section) {
  const card = element("article", "module-card inline-editor-card comments-editor-card");
  const row = element("div", "admin-row");
  row.append(
    field("评论模块标题", section.title, (value) => {
      section.title = value;
    })
  );
  row.append(
    field("评论模块说明", section.description, (value) => {
      section.description = value;
    })
  );
  const sizing = element("div", "admin-row");
  sizing.append(
    numberField("评论列表高度(px)", section.listHeight, 180, 900, 20, (value) => {
      section.listHeight = value;
      renderAdminEditor();
    })
  );
  card.append(row, sizing, renderCommentsSection(page, section, true));
  return card;
}


function videoUploadField(section) {
  const wrapper = element("label", "field video-uploader");
  wrapper.append(element("span", "", "上传视频"));
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    rememberConfigChange();
    state.mediaPending += 1;
    state.saveStatus = "正在处理视频…";
    setSaveBarStatus(state.saveStatus, true);

    try {
      section.src = await fileToDataUrl(file, "video/");
      section.poster = section.poster || (await videoFileToPoster(file));
      section.caption = section.caption || file.name.replace(/\.[^.]+$/, "");
      state.saveStatus = "视频已加入预览，记得保存配置。";
    } catch (error) {
      state.saveStatus = error.message;
    } finally {
      state.mediaPending -= 1;
    }

    renderAdminEditor();
  });
  wrapper.append(input, element("small", "", "适合上传较短视频；大视频建议使用视频外链。"));
  return wrapper;
}

function renderSaveBar(selectedItem) {
  const bar = element("div", "save-bar");
  const status = element("span", "save-status", state.saveStatus || "所有修改已保存");
  status.setAttribute("role", "status");
  const previewTarget = previewTargetFor(selectedItem);
  const preview = withIcon(button("预览", "button save-preview-button", "button"), "eye");
  preview.title = previewTarget.label;
  preview.disabled = !previewTarget.url;
  preview.addEventListener("click", () => { if (previewTarget.url) window.open(previewTarget.url, "_blank", "noopener,noreferrer"); });
  const save = withIcon(button("保存修改", "button primary", "button"), "check");
  save.dataset.saveButton = "true";
  save.title = "保存修改（Ctrl / ⌘ + S）";
  save.disabled = !state.dirty || state.savePending;
  save.addEventListener("click", saveAdminConfig);
  const undo = withIcon(button("", "icon-button save-undo-button", "button"), "undo");
  undo.dataset.undoButton = "true";
  undo.setAttribute("aria-label", "撤销上一步");
  undo.title = "撤销上一步";
  undo.disabled = state.undoStack.length === 0 || state.savePending;
  undo.addEventListener("click", undoAdminChange);
  bar.append(status, undo, preview, save);
  return bar;
}

function previewTargetFor(selectedItem) {
  if (selectedItem?.type === "page") {
    return {
      label: `预览 /${selectedItem.page.slug}`,
      url: `/${selectedItem.page.slug}`
    };
  }

  if (selectedItem?.type === "link") {
    const url = normalizeExternalUrl(selectedItem.link.targetUrl);

    return {
      label: url ? "打开目标网址" : "目标网址未设置",
      url
    };
  }

  return {
    label: "预览主页",
    url: "/"
  };
}

async function saveAdminConfig() {
  if (state.savePending || state.mediaPending > 0) return;
  state.savePending = true;
  state.saveError = false;
  state.saveStatus = "正在保存…";
  setSaveBarStatus(state.saveStatus, true);
  const focused = document.activeElement;
  focused?.blur();
  try {
    const payload = await persistConfig(state.config);
    state.undoStack = [];
    state.undoFingerprint = "";
    state.dirty = false;
    state.savePending = false;
    ensureAdminSelection();
    state.saveStatus = payload.noChanges ? "所有修改已保存" : `已保存于 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    // Rebind controls after persistConfig hydrates the saved config.
    renderAdminEditor();
    notify(payload.noChanges ? "当前内容已是最新版本。" : "修改已保存，网站内容已更新。");
  } catch (error) {
    state.savePending = false;
    state.saveError = true;
    state.saveStatus = error.code === "CONFIG_VERSION_CONFLICT" ? "其他窗口已更新内容，请重新加载后再保存。" : "保存失败，请重试。";
    setSaveBarStatus(state.saveStatus, false);
    notify(error.code === "CONFIG_VERSION_CONFLICT" ? state.saveStatus : error.message, { error: true });
  }
}

async function persistConfig(nextConfig) {
  const config = hydrateConfig(nextConfig);
  const base = state.savedConfig || hydrateConfig(state.config);
  const operations = createConfigPatch(base, config);

  if (operations.length === 0) {
    state.config = config;
    return { ok: true, role: state.adminRole, updatedAt: config.updatedAt, noChanges: true };
  }

  try {
    const payload = await api.postJson("/api/admin/config-patch", {
      baseUpdatedAt: base.updatedAt,
      operations
    }, true);
    config.updatedAt = payload.updatedAt || config.updatedAt;
    state.config = config;
    state.savedConfig = cloneConfig(config);
    clearUnlockedPageCache();
    updateAdminRole(payload.role);
    return payload;
  } catch (error) {
    if (!(error instanceof ApiError) || ![404, 405].includes(error.status)) {
      throw error;
    }
  }

  const payload = await api.postJson("/api/admin/config", { config }, true);
  clearUnlockedPageCache();
  setLoadedConfig(payload.config);
  updateAdminRole(payload.role);
  return payload;
}

function setLoadedConfig(config) {
  state.dirty = false;
  state.saveError = false;
  state.config = hydrateConfig(config);
  state.savedConfig = cloneConfig(state.config);
}

function cloneConfig(config) {
  return structuredClone(config);
}

function updateAdminRole(role) {
  state.adminRole = role || state.adminRole;
  localStorage.setItem(adminRoleKey, state.adminRole);
}

function setSaveBarStatus(message, saving = false) {
  const status = document.querySelector(".save-status");
  const save = document.querySelector("[data-save-button='true']");
  const undo = document.querySelector("[data-undo-button='true']");
  const content = app.querySelector(".admin-content");
  const busy = saving || state.savePending || state.mediaPending > 0;
  app.dataset.saving = String(busy);
  const menuTrigger = app.querySelector(".mobile-menu-button");
  if (menuTrigger) menuTrigger.disabled = busy;
  if (content) content.inert = busy;
  const sidebar = app.querySelector(".admin-sidebar");
  if (sidebar) sidebar.inert = busy || (window.matchMedia("(max-width: 860px)").matches && !app.classList.contains("mobile-nav-open"));
  if (status) {
    status.textContent = message || (state.dirty ? "有未保存的修改" : "所有修改已保存");
    status.dataset.state = busy ? "saving" : state.saveError ? "error" : state.dirty ? "dirty" : "saved";
  }
  if (save) {
    save.disabled = busy || !state.dirty;
    save.replaceChildren(icon(busy ? "clock" : "check"), document.createTextNode(state.savePending ? "保存中…" : busy ? "处理中…" : "保存修改"));
  }
  if (undo) undo.disabled = busy || state.undoStack.length === 0;
}

function markConfigDirty(message = "有未保存的修改") {
  state.dirty = true;
  state.saveError = false;
  state.saveStatus = message;
  setSaveBarStatus(state.saveStatus, state.savePending);
}

function rememberConfigChange() {
  const serialized = JSON.stringify(state.config);

  if (state.undoStack.length > 0 && state.undoFingerprint === serialized) {
    return;
  }

  state.undoStack.push(JSON.parse(serialized));
  state.undoFingerprint = serialized;

  if (state.undoStack.length > maxUndoSteps) {
    state.undoStack.shift();
  }

  markConfigDirty();
}

function undoAdminChange() {
  if (state.savePending || state.mediaPending > 0) return;
  const snapshot = state.undoStack.pop();

  if (!snapshot) {
    return;
  }

  state.config = hydrateConfig(snapshot);
  state.undoFingerprint = "";
  ensureAdminSelection();
  state.dirty = JSON.stringify(state.config) !== JSON.stringify(state.savedConfig);
  state.saveStatus = state.dirty ? "已撤销上一步，仍有未保存修改" : "所有修改已保存";
  renderAdminEditor();
}

function trackUndoOnEdit(control) {
  let captured = false;
  const capture = () => {
    if (!captured) {
      rememberConfigChange();
      captured = true;
    }
  };
  control.addEventListener("beforeinput", capture);
  control.addEventListener("input", capture);
  control.addEventListener("blur", () => { captured = false; });
}

function renderPublicSite() {
  const slug = getRouteSlug();
  const [pageSlug, articleId = ""] = slug.split("/");
  const pages = state.config.pages.filter(page => page.visible);
  const links = state.config.links.filter(link => link.visible && normalizeExternalUrl(link.targetUrl));
  const page = pageSlug ? pages.find(item => item.slug === pageSlug) : null;
  setAppClass("app-shell");
  app.append(renderPublicSidebar(pageSlug, pages, links));
  if (!slug) renderHome(pages, links);
  else if (!page) renderNotFound(slug);
  else if (page.passwordEnabled) {
    const cachedPage = getUnlockedPage(page.slug);
    if (cachedPage) renderPage(cachedPage, articleId);
    else renderPagePasswordGate(page);
  } else renderPage(page, articleId);
  mountPublicNavigation();
}

function renderPublicSidebar(slug, pages, links) {
  const sidebar = element("aside", "sidebar public-sidebar");
  sidebar.id = "site-navigation";
  sidebar.setAttribute("aria-label", "网站导航");
  const brandRow = element("div", "sidebar-brand-row");
  const brand = element("a", "brand public-brand");
  brand.href = "/";
  brand.append(element("span", "brand-mark", "宽"), textBlock("宽宽的网站", "A PERSONAL SPACE"));
  const close = withIcon(button("", "icon-button drawer-close", "button"), "close");
  close.setAttribute("aria-label", "关闭导航菜单");
  close.addEventListener("click", () => app.querySelector(".navigation-scrim")?.click());
  brandRow.append(brand, close);
  const nav = element("nav", "module-nav public-content-nav");
  nav.setAttribute("aria-label", "页面与入口");
  const home = navLink("/", "", "我的首页", "从这里开始", !slug);
  home.firstChild.replaceWith(icon("home", "nav-ui-icon"));
  nav.append(home, element("p", "sidebar-section-label", "探索空间"));
  for (const item of publicNavItems(pages, links)) {
    let destination;
    if (item.type === "page") {
      const page = item.page;
      destination = navLink(`/${page.slug}`, page.entry.sidebarIconText || page.entry.iconText || "PG", sidebarPageTitle(page), page.entry.sidebarDescription || (page.kind === "blog" ? "文章与记录" : page.description || `/${page.slug}`), slug === page.slug, { iconImage: page.entry.sidebarIconImage || page.entry.iconImage });
    } else {
      const link = item.link;
      destination = navLink(normalizeExternalUrl(link.targetUrl), link.iconText || "WEB", link.title, externalLinkSubtitle(link), false, { external: true, iconImage: link.iconImage, fallbackIcon: faviconUrl(link.targetUrl) });
      destination.append(icon("external", "nav-external-icon"));
    }
    nav.append(destination);
  }
  const footer = element("footer", "public-sidebar-footer");
  const signature = element("div", "sidebar-signature");
  signature.append(element("span", "signature-dot"), element("span", "", "保持好奇，慢慢积累。"));
  const admin = element("a", "sidebar-admin-link", "管理网站");
  admin.href = "/admin";
  admin.prepend(icon("settings"));
  footer.append(signature, admin);
  sidebar.append(brandRow, nav, footer);
  return sidebar;
}

function publicNavItems(pages, links) {
  const pageMap = new Map(pages.map((page) => [page.id, page]));
  const linkMap = new Map(links.map((link) => [link.id, link]));
  return hydrateNavOrder(state.config.navOrder, pages, links).map((key) => {
    const [type, id] = key.split(":");
    if (type === "link" && linkMap.has(id)) {
      return { type: "link", link: linkMap.get(id) };
    }
    if (type === "page" && pageMap.has(id)) {
      return { type: "page", page: pageMap.get(id) };
    }
    return null;
  }).filter(Boolean);
}

function renderHome(pages, links) {
  document.title = state.config.homeTitle;
  const main = element("main", "workspace home-workspace");
  const topline = element("div", "public-topline");
  topline.append(element("span", "", "我的空间"), element("span", "", new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })));
  const header = element("header", "workspace-header home-hero");
  const copy = element("div", "home-hero-copy");
  const greeting = element("p", "home-greeting", "你好，欢迎来到这里");
  greeting.prepend(element("span", "greeting-dot"));
  copy.append(greeting, element("h1", "", state.config.homeTitle), element("p", "lead", state.config.homeDescription));
  const count = publicNavItems(pages, links).length;
  const heroFoot = element("div", "hero-footnote");
  heroFoot.append(element("span", "", "记录 · 工具 · 一点乐趣"), element("span", "hero-count", `${String(count).padStart(2, "0")} 个空间入口`));
  copy.append(heroFoot);
  const homeImage = state.config.homeImage?.trim();
  header.classList.toggle("no-visual", !homeImage);
  header.append(copy);
  if (homeImage) {
    const visual = element("figure", "home-visual");
    const image = document.createElement("img");
    image.src = homeImage;
    image.loading = "eager";
    image.decoding = "async";
    image.fetchPriority = "high";
    image.alt = state.config.homeTitle;
    const caption = element("figcaption", "", "生活的切片");
    caption.prepend(icon("image"));
    visual.append(image, caption);
    header.append(visual);
  }
  main.append(topline, header);
  const announcement = renderHomeAnnouncement();
  if (announcement) main.append(announcement);
  const explorer = element("section", "home-explorer");
  const toolbar = element("div", "explorer-toolbar");
  const title = element("div", "explorer-title");
  title.append(element("h2", "", "随处逛逛"), element("span", "", "找到你感兴趣的地方"));
  const search = element("label", "search-field home-search");
  search.append(icon("search"));
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "搜索页面、工具或网站";
  input.setAttribute("aria-label", "搜索页面、工具或网站");
  input.value = state.homeSearch;
  search.append(input);
  toolbar.append(title, search);
  const filterRow = element("div", "explorer-filter-row");
  const filters = element("nav", "entry-filters");
  filters.setAttribute("aria-label", "入口类型");
  const filterButtons = [];
  for (const [value, label] of [["all", "全部"], ["page", "页面与文章"], ["link", "网站与工具"], ["game", "小游戏"]]) {
    const tab = button(label, "entry-filter-button", "button");
    tab.dataset.filter = value;
    tab.addEventListener("click", () => { state.homeFilter = value; updateEntries(); });
    filters.append(tab);
    filterButtons.push(tab);
  }
  filterRow.append(filters, renderHomeViewControl());
  const grid = element("section", `module-grid home-entry-grid layout-${state.homeEntryLayout}`);
  grid.setAttribute("aria-label", "网站入口");
  const cards = [];
  for (const item of publicNavItems(pages, links)) {
    const card = item.type === "page" ? renderPageEntry(item.page) : renderExternalLinkEntry(item.link);
    const value = item.page || item.link;
    card.dataset.entryKind = item.type === "link" && [cubeCityLinkId, llrMarioRunLinkId].includes(value.id) ? "game" : item.type;
    card.dataset.searchText = `${value.title} ${value.description} ${value.entry?.title || ""} ${value.slug || value.targetUrl || ""}`.normalize("NFKC").toLocaleLowerCase();
    cards.push(card);
    grid.append(card);
  }
  const empty = element("div", "search-empty-state");
  empty.append(icon("search"), element("h3", "", "暂时没有找到"), element("p", "", "换个关键词，或者看看全部入口。"));
  const reset = button("查看全部入口", "button", "button");
  reset.addEventListener("click", () => { input.value = ""; state.homeSearch = ""; state.homeFilter = "all"; updateEntries(); input.focus(); });
  empty.append(reset);
  const result = element("p", "explorer-result-count");
  result.setAttribute("aria-live", "polite");
  function updateEntries() {
    state.homeSearch = input.value;
    const query = input.value.trim().normalize("NFKC").toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      card.hidden = !(state.homeFilter === "all" || card.dataset.entryKind === state.homeFilter) || !card.dataset.searchText.includes(query);
      if (!card.hidden) visible += 1;
    }
    for (const tab of filterButtons) {
      const active = tab.dataset.filter === state.homeFilter;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    }
    empty.hidden = visible !== 0;
    result.textContent = query ? `找到 ${visible} 个入口` : `${visible} 个入口，随时出发。`;
  }
  input.addEventListener("input", updateEntries);
  input.addEventListener("keydown", event => { if (event.key === "Escape") { input.value = ""; updateEntries(); } });
  updateEntries();
  explorer.append(toolbar, filterRow, grid, empty, result);
  const footer = element("footer", "site-footer");
  footer.append(element("span", "", "宽宽的个人空间"), element("span", "", "分享发现，也收藏日常。"));
  const connection = document.createElement("details");
  connection.className = "connection-details";
  const summary = element("summary", "", "当前连接与访问统计");
  summary.prepend(icon("info"));
  connection.append(summary, renderVisitorStatusStrip());
  main.append(explorer, footer, connection);
  scheduleVisitorSummary();
  app.append(main);
}

function renderHomeAnnouncement() {
  const announcement = state.config.announcement;
  if (!announcement.enabled || !announcement.text.trim()) return null;
  const banner = element("section", "home-announcement");
  banner.append(icon("message"), element("span", "announcement-label", announcement.title || "公告"), element("p", "announcement-copy", announcement.text));
  const close = withIcon(button("", "icon-button announcement-close", "button"), "close");
  close.setAttribute("aria-label", "关闭公告");
  close.addEventListener("click", () => banner.remove());
  banner.append(close);
  const seconds = Number(announcement.durationSeconds);
  if (Number.isFinite(seconds) && seconds > 0) window.setTimeout(() => banner.remove(), seconds * 1000);
  return banner;
}

function renderPage(page, articleId = "") {
  if (page.kind === "blog") {
    renderBlogPage(page, articleId);
    return;
  }

  document.title = page.title;
  const columnMode = getPageColumnMode(page.slug);
  const main = element("main", "workspace");
  applyPageBackground(main, resolvePageBackground(page));
  const grid = element("section", `module-grid page-module-grid ${columnMode === "default" ? "layout-default" : "layout-fixed"}`);
  if (columnMode !== "default") {
    grid.style.setProperty("--grid-columns", String(columnMode));
  }
  const context = moduleContext(page);
  const renderedSections = [];

  for (const section of page.sections) {
    const node = renderPublicSection(section, context);

    if (node) {
      applySectionLayout(node, section, columnMode);
      renderedSections.push(node);
    }
  }

  if (page.comments.enabled && page.comments.mode === "module") {
    const commentsNode = renderCommentsSection(page, page.comments, false);
    applySectionLayout(commentsNode, page.comments, columnMode);
    renderedSections.push(commentsNode);
  }

  const hasBottomComments = page.comments.enabled && page.comments.mode !== "module";
  const immersive = renderedSections.length + (hasBottomComments ? 1 : 0) === 1;
  if (immersive) {
    setAppClass("app-shell single-module-page");
  } else {
    const header = element("header", "workspace-header compact");
    const copy = element("div");
    copy.append(element("p", "eyebrow", `/${page.slug}`), element("h1", "", page.title));
    if (page.description && page.description !== "在这里填写页面说明。") copy.append(element("p", "lead", page.description));
    header.append(copy);
    main.append(header);
    main.append(renderPageStatusStrip(page, columnMode));
  }

  grid.append(...renderedSections);
  if (!immersive) {
    attachPageModuleCardInteractions(grid);
  }

  if (renderedSections.length === 0 && !hasBottomComments) {
    grid.append(element("p", "empty-state", "这里的内容正在整理中，过一阵再来看看吧。"));
  }

  if (renderedSections.length > 0 || !hasBottomComments) {
    main.append(grid);
  }

  if (hasBottomComments) {
    const commentsRegion = element("section", "bottom-comments-region");
    commentsRegion.append(renderCommentsSection(page, page.comments, false));
    main.append(commentsRegion);
  }

  app.append(main);
}

function attachPageModuleCardInteractions(grid) {
  const cards = Array.from(grid.children).filter((child) => child.classList.contains("module-card"));

  for (const card of cards) {
    card.classList.add("is-module-clickable");
    card.tabIndex = 0;
    card.setAttribute("aria-expanded", "false");

    let gesture = null;

    const cancelGesture = () => {
      gesture = null;
    };

    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.isPrimary === false || isModuleInteractionTarget(event.target)) {
        gesture = null;
        return;
      }

      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        pageScrollX: window.scrollX,
        pageScrollY: window.scrollY,
        cardScrollLeft: card.scrollLeft,
        cardScrollTop: card.scrollTop,
        cancelled: false
      };

      try {
        card.setPointerCapture(event.pointerId);
      } catch {
        gesture = null;
      }
    });

    card.addEventListener("pointermove", (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      const moved = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > moduleClickMoveThreshold;
      const pageScrolled = window.scrollX !== gesture.pageScrollX || window.scrollY !== gesture.pageScrollY;
      const cardScrolled = card.scrollLeft !== gesture.cardScrollLeft || card.scrollTop !== gesture.cardScrollTop;

      if (moved || pageScrolled || cardScrolled) {
        gesture.cancelled = true;
      }
    });

    card.addEventListener("pointerup", (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      const currentGesture = gesture;
      gesture = null;

      try {
        card.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture can already be released by the browser.
      }

      const endedInside = event.target instanceof Node && card.contains(event.target);
      const moved = Math.hypot(event.clientX - currentGesture.startX, event.clientY - currentGesture.startY) > moduleClickMoveThreshold;
      const pageScrolled = window.scrollX !== currentGesture.pageScrollX || window.scrollY !== currentGesture.pageScrollY;
      const cardScrolled = card.scrollLeft !== currentGesture.cardScrollLeft || card.scrollTop !== currentGesture.cardScrollTop;

      if (currentGesture.cancelled || moved || pageScrolled || cardScrolled || !endedInside || isModuleInteractionTarget(event.target)) {
        return;
      }

      event.preventDefault();
      cycleModuleCardState(card, grid);
    });

    card.addEventListener("pointercancel", cancelGesture);
    card.addEventListener("lostpointercapture", cancelGesture);

    card.addEventListener("keydown", (event) => {
      if (isModuleInteractionTarget(event.target)) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        cycleModuleCardState(card, grid);
        return;
      }

      if (event.key === "Escape" && card.dataset.moduleViewState) {
        event.preventDefault();
        clearActiveModuleCard(grid);
        card.focus({ preventScroll: true });
      }
    });
  }
}

function isModuleInteractionTarget(target) {
  return target instanceof Element && Boolean(target.closest(moduleInteractionIgnoreSelector));
}

function cycleModuleCardState(card, grid) {
  if (card.dataset.moduleViewState === "expanded") {
    activateModuleCard(card, grid, "fullscreen");
    return;
  }

  if (card.dataset.moduleViewState === "fullscreen") {
    clearActiveModuleCard(grid);
    return;
  }

  activateModuleCard(card, grid, "expanded");
}

function activateModuleCard(card, grid, viewState) {
  for (const otherCard of Array.from(grid.children).filter((child) => child.classList.contains("module-card"))) {
    if (otherCard !== card) {
      resetModuleCardState(otherCard);
    }
  }

  resetModuleCardState(card);
  card.dataset.moduleViewState = viewState;
  card.setAttribute("aria-expanded", "true");

  if (viewState === "fullscreen") {
    card.classList.add("is-module-fullscreen");
    card.setAttribute("aria-modal", "true");
    document.documentElement.classList.add("module-fullscreen-open");
    return;
  }

  card.classList.add("is-module-expanded");
  document.documentElement.classList.remove("module-fullscreen-open");
}

function clearActiveModuleCard(grid) {
  for (const card of Array.from(grid.children).filter((child) => child.classList.contains("module-card"))) {
    resetModuleCardState(card);
  }

  document.documentElement.classList.remove("module-fullscreen-open");
}

function resetModuleCardState(card) {
  delete card.dataset.moduleViewState;
  card.classList.remove("is-module-expanded", "is-module-fullscreen");
  card.setAttribute("aria-expanded", "false");
  card.removeAttribute("aria-modal");
}

function renderHomeViewControl() {
  const control = element("div", "floating-view-control entry-view-control");
  control.setAttribute("role", "group");
  control.setAttribute("aria-label", "入口展示方式");
  for (const [value, label, symbol] of [["two", "卡片视图", "grid"], ["one", "列表视图", "list"]]) {
    const option = withIcon(button("", "icon-button view-option", "button"), symbol);
    option.title = label;
    option.setAttribute("aria-label", label);
    option.setAttribute("aria-pressed", String(state.homeEntryLayout === value));
    option.classList.toggle("is-active", state.homeEntryLayout === value);
    option.addEventListener("click", () => {
      state.homeEntryLayout = value;
      localStorage.setItem(homeLayoutKey, value);
      const grid = app.querySelector(".home-entry-grid");
      grid.classList.remove("layout-one", "layout-two");
      grid.classList.add(`layout-${value}`);
      for (const button of control.querySelectorAll("button")) {
        const active = button === option;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      }
    });
    control.append(option);
  }
  return control;
}

function renderPagePasswordGate(page) {
  document.title = "需要访问密码 · 宽宽的网站";
  const main = element("main", "workspace page-password-workspace");
  const panel = element("section", "page-password-panel");
  const lock = element("span", "page-access-lock");
  lock.append(icon("lock"));
  panel.append(lock, element("p", "eyebrow", "PRIVATE SPACE"), element("h1", "", page.entry?.title || page.title || "受保护的页面"), element("p", "page-access-description", "这个页面设有访问密码，验证后就可以继续浏览。"));
  const form = element("form", "page-access-form");
  const label = element("label", "field");
  label.append(element("span", "", "页面访问密码"));
  const input = document.createElement("input");
  input.className = "input";
  input.type = "password";
  input.placeholder = "输入页面访问密码";
  input.autocomplete = "current-password";
  input.required = true;
  const submit = withIcon(button("解锁并进入", "button primary", "submit"), "arrow");
  const feedback = element("p", "form-error");
  feedback.id = "page-access-feedback";
  feedback.setAttribute("role", "alert");
  input.setAttribute("aria-describedby", feedback.id);
  label.append(input);
  form.append(label, feedback, submit);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "正在验证…";
    feedback.textContent = "";
    input.removeAttribute("aria-invalid");
    try {
      const payload = await api.postJson("/api/page-access", { slug: page.slug, password: input.value });
      const fullPage = hydratePage(payload.page);
      rememberUnlockedPage(fullPage);
      replaceConfigPage(fullPage);
      await loadModulesForPage(fullPage);
      renderPublicSite();
      if (fullPage.dailyBackgroundEnabled) scheduleDailyBackground(fullPage);
    } catch (error) {
      feedback.textContent = error.message;
      input.setAttribute("aria-invalid", "true");
      submit.disabled = false;
      submit.replaceChildren(icon("arrow"), document.createTextNode("解锁并进入"));
      input.focus();
    }
  });
  const back = element("a", "login-back-link", "返回首页");
  back.href = "/";
  back.prepend(icon("home"));
  panel.append(form, back);
  main.append(panel);
  app.append(main);
}

function getUnlockedPage(slug) {
  try {
    const stored = sessionStorage.getItem(`${pageAccessKeyPrefix}${slug}`);
    const parsed = stored ? JSON.parse(stored) : null;

    if (!parsed?.__unlocked || parsed?.updatedAt !== state.config.updatedAt) {
      sessionStorage.removeItem(`${pageAccessKeyPrefix}${slug}`);
      return null;
    }

    return hydratePage(parsed);
  } catch {
    sessionStorage.removeItem(`${pageAccessKeyPrefix}${slug}`);
    return null;
  }
}

function clearUnlockedPageCache() {
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(pageAccessKeyPrefix)) {
      sessionStorage.removeItem(key);
    }
  }
}

function rememberUnlockedPage(page) {
  sessionStorage.setItem(
    `${pageAccessKeyPrefix}${page.slug}`,
    JSON.stringify({ ...page, __unlocked: true, updatedAt: state.config.updatedAt })
  );
}

function replaceConfigPage(page) {
  const index = state.config.pages.findIndex((item) => item.id === page.id || item.slug === page.slug);

  if (index >= 0) {
    state.config.pages[index] = page;
  }
}

function renderPageStatusStrip(page, columns) {
  const strip = element("section", "page-toolbar");
  strip.append(element("span", "page-content-count", String(countPageModules(page)) + " 项内容"));
  const control = element("label", "page-layout-control");
  control.append(element("span", "", "排列方式"));
  const select = document.createElement("select");
  select.className = "input";
  select.setAttribute("aria-label", "排列方式");
  for (const [value, label] of [["default", "自动布局"], ...[1, 2, 3, 4, 5].map(value => [String(value), value + " 列"])]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = columns === "default" ? "default" : String(columns);
  select.addEventListener("change", () => { setPageColumnMode(page.slug, select.value); renderPublicSite(); });
  control.append(select);
  strip.append(control);
  return strip;
}

function renderPublicSection(section, context) {
  if (section.type === "system") {
    const module = state.modules.find((item) => item.id === section.moduleId);

    return module ? renderModuleCard(module, context) : null;
  }

  if (section.type === "image") {
    return renderImageSection(section);
  }

  if (section.type === "video") {
    return renderVideoSection(section);
  }

  if (section.type === "p2p") {
    return renderP2PEntrySection(section);
  }

  if (section.type === "link") {
    return renderLinkSection(section);
  }

  if (section.type === "navigation") {
    return renderNavigationSection(section);
  }

  if (section.type === "article") {
    return renderArticleSection(section);
  }

  if (section.type === "blog") {
    return renderBlogSection(section, false);
  }

  if (section.type === "comments") {
    return renderCommentsSection(context.page, section, false);
  }

  return renderBlockCard(section);
}

function applySectionLayout(node, section, columns) {
  const layout = hydrateLayout(section.layout, section.type);
  if (columns === "default") {
    node.style.gridColumn = layout.width >= 100 ? "1 / -1" : "";
  } else {
    const span = layout.width > 0 ? Math.max(1, Math.min(columns, Math.round((layout.width / 100) * columns))) : 1;
    node.style.gridColumn = `span ${span}`;
  }
  node.style.minHeight = `${layout.minHeight}px`;
}

function countPageModules(page) {
  return page.sections.length + (page.comments.enabled ? 1 : 0);
}

function getPageColumnMode(slug) {
  const saved = localStorage.getItem(`${pageColumnsKeyPrefix}${slug}`);
  const value = Number(saved);
  if (!saved || saved === "default" || !Number.isFinite(value)) {
    return "default";
  }

  return Math.max(1, Math.min(5, value));
}

function setPageColumnMode(slug, value) {
  if (value === "default") {
    localStorage.removeItem(`${pageColumnsKeyPrefix}${slug}`);
    return;
  }

  const count = Number(value);
  if (!Number.isFinite(count)) {
    localStorage.removeItem(`${pageColumnsKeyPrefix}${slug}`);
    return;
  }

  localStorage.setItem(`${pageColumnsKeyPrefix}${slug}`, String(Math.max(1, Math.min(5, count))));
}

function renderP2PTransferPage() {
  setAppClass("app-shell");
  const room = normalizeRoomId(new URLSearchParams(window.location.search).get("room") || "public");
  const main = element("main", "workspace p2p-workspace");
  const header = element("header", "workspace-header compact");
  const copy = element("div");
  copy.append(element("p", "eyebrow", "WebRTC"), element("h1", "", "P2P 文件传输"));
  copy.append(element("p", "lead", `房间 ${room}。浏览器会尝试直接连接，NAT 太严格时可能需要 TURN 中继。`));
  header.append(copy);
  main.append(header, renderP2PTransferPanel(room));
  app.append(renderPublicSidebar("p2p", state.config.pages.filter((page) => page.visible), state.config.links.filter((link) => link.visible)));
  app.append(main);
}

function renderP2PTransferPanel(room) {
  const panel = element("section", "module-card p2p-panel");
  const status = element("p", "form-hint", "尚未加入房间。");
  const hint = element("p", "form-hint", "协议和端口用于显示设备状态；浏览器实际传输仍使用 WebRTC。对方输入你的串流密码后，你的浏览器会弹出屏幕共享确认。完整管理员可免密码发起请求，但仍需要被串流设备同意浏览器共享。");
  const peersList = element("div", "p2p-peer-list");
  const log = element("div", "p2p-log");
  const name = document.createElement("input");
  name.className = "input";
  name.placeholder = "你的名字";
  name.value = localStorage.getItem("cloudflare-modular-site.p2p-name") || "";
  const join = button("加入房间", "button primary", "button");
  const protocol = document.createElement("select");
  protocol.className = "input";
  for (const value of ["WebRTC", "TCP", "UDP"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    protocol.append(option);
  }
  const port = document.createElement("input");
  port.className = "input";
  port.placeholder = "端口，例如 8080";
  port.inputMode = "numeric";
  const streamPassword = document.createElement("input");
  streamPassword.className = "input";
  streamPassword.type = "password";
  streamPassword.placeholder = "本机串流密码";
  const file = document.createElement("input");
  file.type = "file";
  file.disabled = true;
  const send = button("发送文件", "button", "button");
  send.disabled = true;
  const row = element("div", "admin-row");
  row.append(name, join);
  const networkRow = element("div", "admin-row");
  networkRow.append(protocol, port, streamPassword);
  const sendRow = element("div", "admin-row");
  sendRow.append(file, send);
  const remoteStreams = element("div", "p2p-streams");
  panel.append(row, networkRow, sendRow, hint, status, peersList, remoteStreams, log);

  let session = null;
  const writeLog = (message) => {
    log.prepend(element("p", "", `${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${message}`));
  };

  join.addEventListener("click", () => {
    if (session) {
      session.close();
    }

    localStorage.setItem("cloudflare-modular-site.p2p-name", name.value.trim());
    session = createP2PSession(room, name.value.trim() || "访客", {
      status,
      peersList,
      remoteStreams,
      file,
      send,
      protocol,
      port,
      streamPassword,
      writeLog
    });
    session.start();
    join.textContent = "重新加入";
  });

  send.addEventListener("click", () => {
    const selected = file.files?.[0];

    if (!selected || !session) {
      return;
    }

    session.sendFile(selected);
  });

  return panel;
}

function createP2PSession(room, name, ui) {
  const peerId = crypto.randomUUID();
  const peers = new Map();
  const processed = new Set();
  let since = 0;
  let timer = 0;
  let closed = false;
  let lastPeerList = [];
  const channels = new Map();
  const incoming = new Map();
  const profiles = new Map();
  const streamCards = new Map();
  let localStream = null;
  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] };

  const log = (message) => ui.writeLog(message);
  const postSignal = (type, payload = {}, to = "") =>
    api.postJson(`/api/p2p-signal?room=${encodeURIComponent(room)}`, { peerId, name, type, to, payload }, type === "stream-request");
  const profilePayload = () => ({
    name,
    protocol: ui.protocol.value,
    port: ui.port.value.trim()
  });
  const setStatus = () => {
    const openCount = [...channels.values()].filter((channel) => channel.readyState === "open").length;
    ui.status.textContent = `已加入：${name}。已连接 ${openCount} 个用户。`;
    ui.file.disabled = openCount === 0;
    ui.send.disabled = openCount === 0;
  };
  const renderPeers = (list) => {
    lastPeerList = list;
    ui.peersList.replaceChildren(...list.filter((peer) => peer.id !== peerId).map((peer) => {
      const stateText = channels.get(peer.id)?.readyState || "连接中";
      const profile = profiles.get(peer.id) || {};
      const item = element("div", "p2p-peer-item");
      const requestPassword = document.createElement("input");
      requestPassword.className = "input";
      requestPassword.type = "password";
      requestPassword.placeholder = "对方串流密码";
      const stream = button("请求串流", "button", "button");
      stream.addEventListener("click", () => requestStream(peer.id, requestPassword.value));
      item.append(
        element("p", "form-hint", `${profile.name || peer.name || "访客"}：${stateText} · ${profile.protocol || "WebRTC"} ${profile.port || "未填端口"}`),
        requestPassword,
        stream
      );
      return item;
    }));
  };
  const handleProfileEvent = (event) => {
    if (!event.detail || !peers.has(event.detail.remoteId)) {
      return;
    }

    profiles.set(event.detail.remoteId, event.detail.profile);
    renderPeers(lastPeerList);
  };
  window.addEventListener("p2p-profile", handleProfileEvent);
  const sendProfile = (channel) => {
    if (channel.readyState === "open") {
      channel.send(JSON.stringify({ kind: "profile", ...profilePayload() }));
    }
  };
  const broadcastProfile = () => {
    for (const channel of channels.values()) {
      sendProfile(channel);
    }
  };
  ui.protocol.addEventListener("change", broadcastProfile);
  ui.port.addEventListener("input", broadcastProfile);
  const setupChannel = (remoteId, channel) => {
    channels.set(remoteId, channel);
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => {
      sendProfile(channel);
      log("已建立点对点连接。");
      setStatus();
    });
    channel.addEventListener("close", setStatus);
    channel.addEventListener("message", (event) => handleP2PData(remoteId, event.data, incoming, log));
  };
  const ensurePeer = (remoteId, polite) => {
    if (remoteId === peerId) return null;
    if (peers.has(remoteId)) return peers.get(remoteId);
    const pc = new RTCPeerConnection(rtcConfig);
    peers.set(remoteId, pc);
    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        postSignal("candidate", event.candidate.toJSON(), remoteId).catch(() => {});
      }
    });
    pc.addEventListener("connectionstatechange", () => {
      if (["failed", "disconnected"].includes(pc.connectionState)) {
        log("连接失败或中断，严格 NAT 环境可能需要 TURN 中继。");
      }
      setStatus();
    });
    pc.addEventListener("datachannel", (event) => setupChannel(remoteId, event.channel));
    pc.addEventListener("track", (event) => {
      showRemoteStream(remoteId, event.streams[0]);
    });

    if (!polite) {
      setupChannel(remoteId, pc.createDataChannel("files"));
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).then(() => postSignal("offer", pc.localDescription, remoteId)).catch(() => {
        log("创建连接失败。");
      });
    }

    return pc;
  };
  const handleSignal = async (message) => {
    if (processed.has(message.id) || message.from === peerId) return;
    processed.add(message.id);
    const polite = peerId > message.from;
    const pc = ensurePeer(message.from, polite);
    if (!pc) return;

    if (message.type === "stream-request") {
      await handleStreamRequest(message.from, message.payload || {});
    } else if (message.type === "offer") {
      await pc.setRemoteDescription(message.payload);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await postSignal("answer", pc.localDescription, message.from);
    } else if (message.type === "answer") {
      await pc.setRemoteDescription(message.payload);
    } else if (message.type === "candidate") {
      await pc.addIceCandidate(message.payload);
    }
  };
  const requestStream = async (remoteId, password) => {
    ensurePeer(remoteId, false);
    await postSignal("stream-request", { password }, remoteId);
    log("已发送串流请求。");
  };
  const handleStreamRequest = async (remoteId, payload) => {
    const expected = ui.streamPassword.value;
    if (!payload.admin && (!expected || payload.password !== expected)) {
      log("收到串流请求，但密码不正确。");
      return;
    }

    await startLocalStream(remoteId);
  };
  const startLocalStream = async (remoteId) => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      log("当前浏览器不支持屏幕串流。");
      return;
    }

    const pc = ensurePeer(remoteId, false);
    if (!pc) return;
    if (!localStream) {
      localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      log("已开始共享屏幕。");
    }

    for (const track of localStream.getTracks()) {
      if (!pc.getSenders().some((sender) => sender.track === track)) {
        pc.addTrack(track, localStream);
      }
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await postSignal("offer", pc.localDescription, remoteId);
  };
  const showRemoteStream = (remoteId, stream) => {
    if (!stream || streamCards.has(remoteId)) {
      return;
    }

    const card = element("article", "module-card p2p-stream-card");
    const video = document.createElement("video");
    video.autoplay = true;
    video.controls = true;
    video.playsInline = true;
    video.srcObject = stream;
    card.append(element("h3", "", "远程串流"), video);
    ui.remoteStreams.prepend(card);
    streamCards.set(remoteId, card);
    log("正在播放远程串流。");
  };
  const poll = async () => {
    if (closed) return;
    try {
      await postSignal("heartbeat");
      const payload = await api.getJson(`/api/p2p-signal?room=${encodeURIComponent(room)}&peer=${encodeURIComponent(peerId)}&since=${since}`);
      since = payload.now || since;
      renderPeers(payload.peers || []);
      for (const peer of payload.peers || []) {
        if (peer.id !== peerId && peerId < peer.id) ensurePeer(peer.id, false);
      }
      for (const message of payload.messages || []) {
        await handleSignal(message);
      }
      setStatus();
    } catch (error) {
      log(error.message || "信令失败。");
    }
    timer = window.setTimeout(poll, 1600);
  };

  return {
    start() {
      ui.status.textContent = "正在加入房间...";
      poll();
    },
    close() {
      closed = true;
      window.clearTimeout(timer);
      window.removeEventListener("p2p-profile", handleProfileEvent);
      ui.protocol.removeEventListener("change", broadcastProfile);
      ui.port.removeEventListener("input", broadcastProfile);
      if (localStream) {
        for (const track of localStream.getTracks()) track.stop();
      }
      for (const pc of peers.values()) pc.close();
      peers.clear();
      channels.clear();
    },
    sendFile(file) {
      const openChannels = [...channels.values()].filter((channel) => channel.readyState === "open");
      if (openChannels.length === 0) {
        log("还没有可用连接。");
        return;
      }
      for (const channel of openChannels) sendFileOverChannel(channel, file, log);
    }
  };
}

function sendFileOverChannel(channel, file, log) {
  const chunkSize = 64 * 1024;
  const transferId = crypto.randomUUID();
  channel.send(JSON.stringify({ kind: "file-meta", id: transferId, name: file.name, size: file.size, type: file.type }));
  let offset = 0;
  const reader = new FileReader();
  reader.onload = () => {
    channel.send(reader.result);
    offset += reader.result.byteLength;
    if (offset < file.size) {
      readNext();
    } else {
      channel.send(JSON.stringify({ kind: "file-end", id: transferId }));
      log(`已发送 ${file.name}`);
    }
  };
  const readNext = () => reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
  readNext();
}

function handleP2PData(remoteId, data, incoming, log) {
  if (typeof data === "string") {
    const message = JSON.parse(data);
    if (message.kind === "profile") {
      const event = new CustomEvent("p2p-profile", { detail: { remoteId, profile: message } });
      window.dispatchEvent(event);
    } else if (message.kind === "file-meta") {
      incoming.set(message.id, { ...message, chunks: [], received: 0 });
      log(`开始接收 ${message.name}`);
    } else if (message.kind === "file-end") {
      const transfer = incoming.get(message.id);
      if (!transfer) return;
      const blob = new Blob(transfer.chunks, { type: transfer.type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = transfer.name || `file-from-${remoteId}`;
      link.textContent = `下载 ${transfer.name || "文件"}`;
      link.className = "button";
      log(`接收完成：${transfer.name}`);
      document.querySelector(".p2p-log")?.prepend(link);
      incoming.delete(message.id);
    }
    return;
  }

  const latest = [...incoming.values()].at(-1);
  if (latest) {
    latest.chunks.push(data);
    latest.received += data.byteLength || data.size || 0;
  }
}

function renderNotFound(slug) {
  document.title = "页面不存在";
  const main = element("main", "workspace");
  const header = element("header", "workspace-header compact");
  const copy = element("div");
  copy.append(element("p", "eyebrow", "Not Found"), element("h1", "", "页面不存在"));
  copy.append(element("p", "lead", `没有找到 /${slug}，可以回到主页选择已有分页面。`));
  header.append(copy);
  main.append(header);
  const link = document.createElement("a");
  link.className = "button primary";
  link.href = "/";
  link.textContent = "返回主页";
  main.append(link);
  app.append(main);
}

function renderStatusStrip(items) {
  const strip = element("section", "status-strip");

  for (const [label, value] of items) {
    const item = element("div");
    item.append(element("span", "metric-label", label), element("strong", "", value));
    strip.append(item);
  }

  return strip;
}

function renderVisitorStatusStrip() {
  const summary = state.visitorSummary || visitorSummaryFallback;
  return renderStatusStrip([
    ["IP", summary.ip || "未知"],
    ["地区", summary.region || "未知"],
    ["运营商", summary.isp || "未知"],
    ["近期访问量", String(summary.recentVisits ?? "未知")]
  ]);
}

async function loadVisitorSummary() {
  try {
    const payload = await api.getJson("/api/visitor-summary");
    state.visitorSummary = payload;
    const strip = document.querySelector(".status-strip");
    if (strip) {
      strip.replaceWith(renderVisitorStatusStrip());
    }
  } catch {
    state.visitorSummary = {
      ip: "获取失败",
      region: "获取失败",
      isp: "获取失败",
      recentVisits: "获取失败"
    };
  }
}

function scheduleVisitorSummary() {
  const run = () => loadVisitorSummary();

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 1200 });
    return;
  }

  window.setTimeout(run, 240);
}

function renderPageEntry(page) {
  return renderDestinationCard({ title: page.entry.title || page.title, description: page.entry.description || page.description, href: `/${page.slug}`, image: page.entry.backgroundImage, marker: entryMark(page.entry), kind: page.kind === "blog" ? "博客" : "页面", meta: `/${page.slug}`, locked: page.passwordEnabled });
}

function renderExternalLinkEntry(link) {
  const targetUrl = normalizeExternalUrl(link.targetUrl);
  const game = [cubeCityLinkId, llrMarioRunLinkId].includes(link.id);
  const card = renderDestinationCard({ title: link.title || "网站入口", description: link.description || externalLinkSubtitle(link), href: targetUrl, image: link.backgroundImage, marker: linkMark(link), kind: game ? "小游戏" : "网站", meta: game ? "休息一下，再出发" : externalLinkSubtitle(link) });
  card.classList.add("external-entry-card");
  return card;
}

function renderLinkSection(section) {
  const card = element("article", "module-card entry-card external-entry-card link-section-card");
  applyEntryCardStyle(card, section.backgroundImage);
  const targetUrl = normalizeExternalUrl(section.targetUrl);
  const header = element("header", "module-card-header no-toggle");
  header.append(linkMark(section), textBlock(section.title || "网站入口", section.description || externalLinkSubtitle(section)));

  const anchor = document.createElement("a");
  anchor.className = "button primary";
  anchor.href = targetUrl || "#";
  anchor.rel = "noreferrer";
  anchor.textContent = targetUrl ? "前往" : "未设置网址";

  if (!targetUrl) {
    anchor.setAttribute("aria-disabled", "true");
    anchor.addEventListener("click", (event) => event.preventDefault());
  }

  card.append(header, anchor);
  return card;
}

function renderNavigationSection(section) {
  const card = element("article", "module-card navigation-section");
  const colorTile = element("div", `navigation-color-tile navigation-color-${navigationColorIndex(section.id)}`);
  colorTile.setAttribute("aria-hidden", "true");
  const header = element("header", "navigation-section-header");
  header.append(element("h2", "", section.title || "导航"));
  const list = element("ol", "navigation-list");

  for (const item of section.items) {
    const targetUrl = normalizeExternalUrl(item.url);
    if (!targetUrl) {
      continue;
    }

    const entry = element("li", "navigation-item");
    const anchor = element("a", "navigation-link");
    anchor.href = targetUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    const icon = element("span", "navigation-link-icon");
    const fallback = element("span", "navigation-link-initial", navigationInitial(item.name, targetUrl));
    const iconUrl = faviconUrl(targetUrl);

    if (iconUrl) {
      const image = document.createElement("img");
      image.src = iconUrl;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => image.replaceWith(fallback), { once: true });
      icon.append(image);
    } else {
      icon.append(fallback);
    }

    anchor.append(icon, element("span", "navigation-link-name", item.name || externalLinkSubtitle({ targetUrl })));
    entry.append(anchor);
    list.append(entry);
  }

  if (!list.children.length) {
    card.append(colorTile, header, element("p", "empty-state", "管理员还没有添加可用网址。"));
    return card;
  }

  card.append(colorTile, header, list);
  return card;
}

function navigationColorIndex(id) {
  let hash = 0;
  for (const character of String(id || "navigation")) {
    hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
  }
  return Math.abs(hash) % 4;
}

function navigationInitial(name, url) {
  const source = String(name || externalLinkSubtitle({ targetUrl: url }) || "网").trim();
  return source.slice(0, 1).toUpperCase();
}

function renderArticleSection(section) {
  const card = element("article", "module-card entry-card article-entry-card");
  const reference = resolveArticleReference(section.articlePath);
  if (!reference) {
    card.append(element("p", "empty-state", section.articlePath ? "没有找到这个文章路径。" : "请在管理员界面填写文章路径。"));
    return card;
  }

  const { page, article } = reference;
  applyEntryCardStyle(card, article.coverImage);
  const header = element("header", "module-card-header no-toggle");
  header.append(mark((article.category || "文").slice(0, 2).toUpperCase()), textBlock(article.title, article.summary || page.description));
  const open = element("a", "button primary", "阅读文章");
  open.href = `/${page.slug}/${article.id}`;
  card.append(header, open);
  return card;
}

function resolveArticleReference(path) {
  const normalized = normalizeArticlePath(path);
  const [pageSlug, articleId] = normalized.replace(/^\/+/, "").split("/");
  if (!pageSlug || !articleId) {
    return null;
  }
  const page = state.config.pages.find((item) => item.kind === "blog" && item.slug === pageSlug);
  const article = page?.blog?.articles?.find((item) => item.id.toLowerCase() === articleId.toLowerCase());
  return page && article ? { page, article } : null;
}

function normalizeArticlePath(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    const path = url.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
    return path ? `/${path}` : "";
  } catch {
    const path = String(value || "").split(/[?#]/)[0].replace(/^\/+|\/+$/g, "").toLowerCase();
    return path ? `/${path}` : "";
  }
}

function renderP2PEntrySection(section) {
  const card = element("article", "module-card entry-card p2p-entry-card");
  const header = element("header", "module-card-header no-toggle");
  header.append(mark("P2P"), textBlock(section.title || "P2P 文件传输", section.description || "进入房间后尝试点对点传文件。"));
  const link = document.createElement("a");
  link.className = "button primary";
  link.href = `/p2p?room=${encodeURIComponent(section.room || section.id)}`;
  link.textContent = "进入房间";
  card.append(header, element("p", "form-hint", `房间：${section.room || section.id}`), link);
  return card;
}

function renderBlogSection(section, adminPreview = false) {
  const card = element("article", adminPreview ? "module-card blog-section blog-admin-preview" : "module-card blog-section");
  const articles = [...(section.articles || [])];
  const categories = section.categories?.length ? section.categories : [...new Set(articles.map((article) => article.category).filter(Boolean))];
  const featured = articles.filter((article) => article.featured).slice(0, 2);
  const heroArticles = featured.length ? featured : articles.slice(0, 2);

  const top = element("header", "blog-topbar");
  top.append(
    element("strong", "", section.title || "博客"),
    element("span", "", section.description || "发布文章和记录。")
  );
  card.append(top);

  if (section.notice) {
    const notice = element("div", "blog-notice");
    notice.append(mark("NB"), element("strong", "", section.notice));
    card.append(notice);
  }

  if (!articles.length) {
    card.append(element("p", "empty-state", "还没有发布文章。"));
    return card;
  }

  const hero = element("section", "blog-hero-grid");
  heroArticles.forEach((article, index) => {
    hero.append(renderBlogHeroArticle(article, index === 0));
  });
  card.append(hero);

  const tabs = element("nav", "blog-tabs");
  tabs.append(element("span", "is-active", "推荐"));
  for (const category of categories.slice(0, 8)) {
    tabs.append(element("span", "", category));
  }
  card.append(tabs);

  const body = element("section", "blog-layout");
  const sidebar = element("aside", "blog-sidebar-card");
  const avatar = section.profileImage ? document.createElement("img") : null;
  if (avatar) {
    avatar.src = section.profileImage;
    avatar.loading = "lazy";
    avatar.decoding = "async";
    avatar.alt = section.profileName || "作者头像";
  }
  sidebar.append(
    avatar || mark((section.profileName || "站长").slice(0, 2).toUpperCase()),
    element("h3", "", section.profileName || "站长"),
    element("p", "", section.profileDescription || "这里是博客作者介绍。")
  );
  const tagCloud = element("div", "blog-tag-cloud");
  for (const tag of collectBlogTags(articles).slice(0, 18)) {
    tagCloud.append(element("span", "", tag));
  }
  sidebar.append(tagCloud);

  const list = element("div", "blog-card-list");
  articles.forEach((article) => list.append(renderBlogArticleCard(article)));
  body.append(sidebar, list);
  card.append(body);
  return card;
}

function renderBlogPage(page, articleId = "") {
  document.title = page.title;
  const blog = hydrateBlogSection(page.blog);
  const orderedArticles = blog.articles || [];
  const currentArticle = articleId ? orderedArticles.find((article) => article.id.toLowerCase() === articleId.toLowerCase()) : null;

  if (articleId) {
    renderBlogArticlePage(page, blog, currentArticle, orderedArticles);
    return;
  }

  const main = element("main", "workspace blog-page-workspace");
  applyPageBackground(main, resolvePageBackground(page));
  const articles = orderedArticles;
  const categories = blog.categories?.length ? blog.categories : [...new Set(articles.map((article) => article.category).filter(Boolean))];
  const filterKey = `cloudflare-modular-site.blog-filter.${page.slug}`;
  const storedFilter = localStorage.getItem(filterKey);
  const activeFilter = ["全部", "推荐", ...categories].includes(storedFilter) ? storedFilter : "全部";
  const filteredArticles = filterBlogArticles(articles, activeFilter);

  const nav = element("header", "blog-page-nav");
  nav.append(element("strong", "", "文字与记录 · WRITING SPACE"));
  main.append(nav);

  if (blog.notice) {
    const notice = element("section", "blog-page-notice");
    notice.append(mark("NB"), element("strong", "", blog.notice), element("span", "", "›"));
    main.append(notice);
  }

  const hero = element("section", "blog-page-hero");
  const intro = element("article", "blog-page-intro");
  intro.append(element("p", "eyebrow", "NOTES & DISCOVERIES"), element("h1", "", page.title || blog.title || "博客"));
  intro.append(element("p", "", blog.description || page.description || "记录日常，分享值得收藏的发现。"));
  const quick = element("div", "blog-quick-links");
  for (const label of categories.slice(0, 4)) {
    quick.append(element("span", "", label));
  }
  intro.append(quick);
  hero.append(intro);
  main.append(hero);

  const tabs = element("nav", "blog-page-tabs");
  const tabLabels = ["全部", "推荐", ...categories.filter((label) => label !== "推荐").slice(0, 7)];
  for (const label of tabLabels) {
    const tab = button(label, activeFilter === label ? "blog-tab-button is-active" : "blog-tab-button", "button");
    tab.addEventListener("click", () => {
      localStorage.setItem(filterKey, label);
      renderPublicSite();
    });
    tabs.append(tab);
  }
  main.append(tabs);

  if (isAdminSession()) {
    const publisher = document.createElement("details");
    publisher.className = "modern-settings-details quick-publisher-disclosure";
    publisher.append(element("summary", "", "管理员快捷发布"), renderBlogQuickPublisher(page, blog));
    main.append(publisher);
  } else {
    main.append(renderPublicBlogPublisher(page, blog));
  }

  const list = element("section", "blog-page-articles");
  if (!articles.length) {
    list.append(element("p", "empty-state", "还没有发布文章。欢迎写下第一篇分享。"));
  } else if (!filteredArticles.length) {
    list.append(element("p", "empty-state", "这个分类下还没有文章。"));
  } else {
    filteredArticles.forEach((article) => list.append(renderBlogListItem(page, blog, article)));
  }
  main.append(list, renderBlogAuthorFooter(blog));
  app.append(main);
}

function sortBlogArticles(articles) {
  return [...(articles || [])].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));
}

function renderBlogListItem(page, blog, article) {
  const editable = canCurrentAdminEditArticle(article);
  const item = element("article", editable ? "blog-list-item is-admin-draggable" : "blog-list-item");
  item.dataset.articleId = article.id;
  if (editable) {
    item.draggable = true;
    item.title = "拖拽可调整文章顺序";
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/blog-public-article-id", article.id);
      item.classList.add("is-dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("is-dragging"));
    item.addEventListener("dragover", (event) => {
      if (!event.dataTransfer.types.includes("text/blog-public-article-id")) return;
      event.preventDefault();
      item.classList.add("is-drop-target");
    });
    item.addEventListener("dragleave", () => item.classList.remove("is-drop-target"));
    item.addEventListener("drop", async (event) => {
      const sourceId = event.dataTransfer.getData("text/blog-public-article-id");
      event.preventDefault();
      item.classList.remove("is-drop-target");
      await reorderBlogArticleFromPublicPage(page, sourceId, article.id);
    });
  }
  const link = document.createElement("a");
  link.className = "blog-list-cover";
  link.href = `/${page.slug}/${article.id}`;
  if (article.coverImage) {
    const image = document.createElement("img");
    image.src = article.coverImage;
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = article.title || "";
    link.append(image);
  } else {
    link.append(mark((article.category || "文").slice(0, 2).toUpperCase()));
  }

  const content = element("div", "blog-list-content");
  const meta = element("div", "blog-list-meta");
  meta.append(
    element("span", "", article.category || "文章"),
    element("span", "", article.authorName || (article.authorRole === "public" ? "匿名" : "站长")),
    element("span", "", formatDateTime(article.createdAt))
  );
  const title = document.createElement("a");
  title.href = `/${page.slug}/${article.id}`;
  title.textContent = article.title || "未命名文章";
  title.className = "blog-list-title";
  content.append(meta, title);
  if (article.summary) {
    content.append(element("p", "", article.summary));
  }
  const tags = element("div", "blog-list-tags");
  for (const tag of article.tags || []) {
    tags.append(element("span", "", `#${tag}`));
  }
  content.append(tags);

  if (editable) {
    const actions = element("div", "blog-list-admin-actions");
    const edit = element("a", "button blog-edit-button", "编辑");
    edit.href = `/${page.slug}/${article.id}?edit=1`;
    const remove = button("删除", "button danger blog-delete-button", "button");
    remove.addEventListener("click", () => deleteBlogArticle(page, article.id));
    actions.append(edit, remove);
    content.append(actions);
  }

  item.append(link, content);
  return item;
}

function canCurrentAdminEditArticle(article) {
  return isAdminSession() && !(isLimitedAdmin() && article.authorRole === "admin");
}

function renderBlogAuthorFooter(blog) {
  const footer = element("section", "blog-author-footer");
  const avatar = blog.profileImage ? document.createElement("img") : null;
  if (avatar) {
    avatar.src = blog.profileImage;
    avatar.loading = "lazy";
    avatar.decoding = "async";
    avatar.alt = blog.profileName || "作者头像";
  }
  footer.append(
    avatar || mark((blog.profileName || "站长").slice(0, 2).toUpperCase()),
    element("div")
  );
  const copy = footer.lastElementChild;
  copy.append(element("h2", "", blog.profileName || "站长"), element("p", "", blog.profileDescription || "这里是博客作者介绍。"));
  return footer;
}

function renderBlogArticlePage(page, blog, article, articles) {
  if (!article) {
    renderNotFound(`${page.slug}/文章`);
    return;
  }

  document.title = `${article.title} - ${page.title}`;
  const main = element("main", "workspace blog-article-workspace");
  const breadcrumb = element("nav", "article-breadcrumb");
  breadcrumb.setAttribute("aria-label", "文章位置");
  const backHome = element("a", "", "首页"); backHome.href = "/";
  const backBlog = element("a", "", page.title); backBlog.href = `/${page.slug}`;
  breadcrumb.append(backHome, icon("chevron"), backBlog, icon("chevron"), element("span", "", "文章"));
  main.append(breadcrumb);
  const hero = element("header", "blog-article-hero");
  const tags = element("div", "blog-list-tags");
  tags.append(element("span", "", article.category || "文章"));
  for (const tag of article.tags || []) {
    tags.append(element("span", "", `#${tag}`));
  }
  hero.append(tags, element("h1", "", article.title || "未命名文章"), renderArticleAuthorLine(blog, article));
  const readerTools = element("div", "article-reader-tools");
  readerTools.append(element("span", "", `约 ${Math.max(1, Math.ceil((article.body || htmlToPlainText(article.bodyHtml || "")).length / 450))} 分钟阅读`));
  const copyLink = withIcon(button("复制链接", "button article-copy-link", "button"), "link");
  copyLink.addEventListener("click", async () => { try { await navigator.clipboard.writeText(`${location.origin}/${page.slug}/${article.id}`); notify("文章链接已复制。"); } catch { notify("复制失败，可以从地址栏复制链接。", { error: true }); } });
  readerTools.append(copyLink); hero.append(readerTools);
  main.append(hero);

  const layout = element("section", "blog-article-layout");
  const aside = element("aside", "blog-article-aside");
  aside.append(element("h3", "", "最近发布"));
  for (const item of articles.slice(0, 6)) {
    const link = document.createElement("a");
    link.href = `/${page.slug}/${item.id}`;
    link.textContent = item.title || "未命名文章";
    link.classList.toggle("is-active", item.id === article.id);
    aside.append(link);
  }

  const content = element("article", "blog-article-detail");
  if (article.coverImage) {
    const image = document.createElement("img");
    image.src = article.coverImage;
    image.loading = "eager";
    image.decoding = "async";
    image.alt = article.title || "";
    content.append(image);
  }
  if (article.summary) {
    content.append(element("p", "lead", article.summary));
  }
  if (canCurrentAdminEditArticle(article) && new URLSearchParams(window.location.search).get("edit") === "1") {
    content.append(renderArticlePublicEditor(page, article));
  } else {
    content.append(renderArticleContent(article));
  }
  if (isAdminSession()) {
    const actions = element("div", "blog-article-admin-actions");
    if (canCurrentAdminEditArticle(article)) {
      const edit = element("a", "button", new URLSearchParams(window.location.search).get("edit") === "1" ? "退出编辑" : "编辑文章");
      edit.href = new URLSearchParams(window.location.search).get("edit") === "1" ? `/${page.slug}/${article.id}` : `/${page.slug}/${article.id}?edit=1`;
      actions.append(edit);
    }
    const remove = button("删除这篇文章", "button danger", "button");
    remove.addEventListener("click", () => deleteBlogArticle(page, article.id));
    actions.append(remove);
    content.prepend(actions);
  }

  const headings = [...content.querySelectorAll(".blog-article-rich-body h2, .blog-article-rich-body h3")];
  if (headings.length > 1) {
    const toc = element("nav", "article-toc"); toc.setAttribute("aria-label", "文章目录"); toc.append(element("h3", "", "本文目录"));
    headings.forEach((heading, index) => { heading.id ||= `article-heading-${index}`; const link = element("a", "", heading.textContent); link.href = `#${heading.id}`; toc.append(link); });
    aside.prepend(toc);
  }
  layout.append(aside, content);
  const comments = renderCommentsSection(
    { slug: `${page.slug}/${article.id}` },
    {
      title: "文章评论",
      description: "留下你的想法。",
      listHeight: 360
    },
    isAdminSession()
  );
  comments.classList.add("blog-article-comments");
  main.append(layout, comments);
  app.append(main);
}

function renderArticlePublicEditor(page, article) {
  const form = element("form", "blog-public-editor");
  form.append(element("h2", "", "编辑文章"));
  const title = publisherInput("文章标题", "input", "");
  title.control.value = article.title || "";
  const category = publisherInput("分类", "input", "");
  category.control.value = article.category || "";
  const tags = publisherInput("标签", "input", "用逗号分隔");
  tags.control.value = (article.tags || []).join(", ");
  const cover = publisherImageInput("封面图片", "粘贴图片地址，可留空");
  cover.control.value = article.coverImage || "";
  const summary = publisherInput("简介", "textarea", "");
  summary.control.value = article.summary || "";
  const body = publisherRichTextInput("正文", "像文档一样编辑正文。");
  body.control.innerHTML = articleBodyHtml(article);
  const feedback = element("p", "form-hint");
  const save = button("保存文章", "button primary", "submit");

  const grid = element("div", "blog-publisher-grid");
  grid.append(title.field, category.field, tags.field, cover.field, summary.field, body.field);
  const actions = element("div", "blog-publisher-actions");
  actions.append(save, feedback);
  form.append(grid, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    save.textContent = "保存中...";
    feedback.textContent = "正在保存文章...";

    try {
      await updateBlogArticleFromPublicPage(page, article.id, (target) => {
        target.title = title.control.value.trim() || "未命名文章";
        target.category = category.control.value.trim() || "随笔";
        target.tags = splitTags(tags.control.value).slice(0, 12);
        target.coverImage = cover.control.value.trim();
        target.summary = summary.control.value.trim();
        target.bodyHtml = normalizeEditorHtml(body.control.innerHTML);
        target.body = htmlToPlainText(target.bodyHtml);
        target.updatedAt = new Date().toISOString();
      });
      window.history.replaceState(null, "", `/${page.slug}/${article.id}`);
      renderPublicSite();
    } catch (error) {
      feedback.textContent = error.message;
      save.disabled = false;
      save.textContent = "保存文章";
    }
  });
  return form;
}

function renderArticleAuthorLine(blog, article) {
  const line = element("div", "blog-article-author-line");
  const avatar = blog.profileImage ? document.createElement("img") : null;
  if (avatar) {
    avatar.src = blog.profileImage;
    avatar.loading = "eager";
    avatar.decoding = "async";
    avatar.alt = blog.profileName || "作者头像";
  }
  const authorName = article.authorName || blog.profileName || "匿名";
  line.append(
    avatar || mark(authorName.slice(0, 2).toUpperCase()),
    textBlock(`${authorName} · ${formatDateTime(article.createdAt)}`, article.authorRole === "public" ? "访客投稿" : blog.profileDescription || "")
  );
  return line;
}

async function deleteBlogArticle(page, articleId) {
  const article = page.blog?.articles?.find((item) => item.id === articleId);
  const confirmed = await confirmAction({
    title: `删除“${article?.title || "未命名文章"}”？`,
    description: "这篇文章会立即从公开博客中移除。",
    confirmLabel: "删除文章",
    destructive: true
  });
  if (!confirmed) {
    return;
  }

  const params = new URLSearchParams({ slug: page.slug, id: articleId });
  if (state.config.updatedAt) {
    params.set("baseUpdatedAt", state.config.updatedAt);
  }

  try {
    await api.deleteJson(`/api/admin/blog/articles?${params.toString()}`, true);
    if (getRouteSlug() === `${page.slug}/${articleId}`) {
      window.history.replaceState(null, "", `/${page.slug}`);
    }
    state.config = hydrateConfig(await loadPublicConfig());
    state.savedConfig = cloneConfig(state.config);
    renderPublicSite();
    notify("文章已删除。", { error: false });
  } catch (error) {
    if (error.code === "CONFIG_VERSION_CONFLICT") {
      state.config = hydrateConfig(await loadPublicConfig());
      renderPublicSite();
    }
    notify(error.message, { error: true });
  }
}

async function reorderBlogArticleFromPublicPage(page, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) {
    return;
  }

  await updateBlogFromPublicPage(page, (blog) => {
    reorderArticleArray(blog.articles, sourceId, targetId);
  });
  renderPublicSite();
}

async function updateBlogArticleFromPublicPage(page, articleId, updater) {
  await updateBlogFromPublicPage(page, (blog) => {
    const target = blog.articles.find((article) => article.id === articleId);
    if (!target) {
      throw new Error("没有找到这篇文章。");
    }
    updater(target);
  });
}

async function updateBlogFromPublicPage(page, updater) {
  const config = hydrateConfig(state.config);
  const targetPage = config.pages.find((item) => item.id === page.id);
  if (!targetPage) {
    throw new Error("没有找到当前博客分页面。");
  }
  targetPage.blog = hydrateBlogSection(targetPage.blog);
  updater(targetPage.blog);
  await persistConfig(config);
}

function reorderArticleArray(articles, sourceId, targetId) {
  const sourceIndex = articles.findIndex((article) => article.id === sourceId);
  const targetIndex = articles.findIndex((article) => article.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }
  const [article] = articles.splice(sourceIndex, 1);
  articles.splice(targetIndex, 0, article);
}

function filterBlogArticles(articles, filter) {
  if (filter === "全部" || filter === "更多") {
    return articles;
  }

  if (filter === "推荐") {
    const featured = articles.filter((article) => article.featured);
    return featured.length ? featured : articles;
  }

  return articles.filter((article) => article.category === filter);
}

function renderPublicBlogPublisher(page, blog) {
  const panel = element("section", "blog-publisher-panel public-blog-publisher");
  const head = element("div", "blog-publisher-head");
  const copy = element("div");
  copy.append(
    element("p", "eyebrow", "OPEN PUBLISHING"),
    element("h2", "", "分享一篇文章"),
    element("p", "", "无需登录，写下署名、标题和正文，发布后会立即出现在博客里。管理员可以删除不合适的文章。")
  );
  head.append(copy);

  const form = element("form", "blog-publisher-form");
  const author = publisherInput("署名", "input", "例如：小明");
  author.control.autocomplete = "nickname";
  const title = publisherInput("文章标题", "input", "给这篇文章起个清楚的标题");
  title.control.maxLength = 120;
  const category = publisherInput("分类", "input", blog.categories?.[0] || "随笔");
  category.control.maxLength = 30;
  const tags = publisherInput("标签", "input", "可选，用逗号分隔");
  const cover = publisherInput("封面图片地址", "input", "可选，填写 https:// 图片地址");
  const summary = publisherInput("简介", "textarea", "可选，用一两句话介绍文章");
  const body = publisherInput("正文", "textarea", "写下你想分享的内容");
  body.control.rows = 11;
  body.control.maxLength = 16_000;
  const submit = button("公开发布", "button primary", "submit");
  const feedback = element("p", "form-hint");

  const grid = element("div", "blog-publisher-grid");
  grid.append(author.field, title.field, category.field, tags.field, cover.field, summary.field, body.field);
  const actions = element("div", "blog-publisher-actions");
  actions.append(submit, feedback);
  form.append(grid, actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const articleTitle = title.control.value.trim();
    const articleBody = body.control.value.trim();
    if (!articleTitle || !articleBody) {
      feedback.textContent = "标题和正文不能为空。";
      (articleTitle ? body.control : title.control).focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = "发布中…";
    feedback.textContent = "正在发布文章…";

    try {
      await api.postJson("/api/blog/articles", {
        slug: page.slug,
        authorName: author.control.value.trim(),
        title: articleTitle,
        category: category.control.value.trim(),
        tags: tags.control.value,
        coverImage: cover.control.value.trim(),
        summary: summary.control.value.trim(),
        body: articleBody
      });
      state.config = hydrateConfig(await loadPublicConfig());
      state.savedConfig = cloneConfig(state.config);
      notify("文章已公开发布。", { error: false });
      renderPublicSite();
    } catch (error) {
      feedback.textContent = error.message;
      submit.disabled = false;
      submit.textContent = "公开发布";
    }
  });

  panel.append(head, form);
  return panel;
}

function renderBlogQuickPublisher(page, blog) {
  const panel = element("section", "blog-publisher-panel");
  const head = element("div", "blog-publisher-head");
  const copy = element("div");
  copy.append(
    element("p", "eyebrow", "Admin Publish"),
    element("h2", "", "快速发布文章"),
    element("p", "", "已登录管理员可直接在当前博客分页面发布，保存后立即同步到 Cloudflare。")
  );
  const editLink = element("a", "button", "进入完整编辑");
  editLink.href = "/admin";
  head.append(
    copy,
    editLink
  );

  const form = element("form", "blog-publisher-form");
  const title = publisherInput("文章标题", "input", "例如：今天的新记录");
  const category = publisherInput("分类", "input", blog.categories?.[0] || "随笔");
  const tags = publisherInput("标签", "input", "用逗号分隔");
  const cover = publisherImageInput("封面图片", "粘贴图片地址，可留空");
  const summary = publisherInput("简介", "textarea", "一两句话说明这篇文章讲什么。");
  const body = publisherRichTextInput("正文", "写下正文内容，支持 Ctrl+B / Ctrl+I / Ctrl+U，粘贴图片和文件。");
  const featured = checkbox("设为推荐文章", false, () => {});
  const submit = button("发布并保存", "button primary", "submit");
  const feedback = element("p", "form-hint");

  const grid = element("div", "blog-publisher-grid");
  grid.append(title.field, category.field, tags.field, cover.field, summary.field, body.field);
  const actions = element("div", "blog-publisher-actions");
  actions.append(featured, submit, feedback);
  form.append(grid, actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const articleTitle = title.control.value.trim();

    if (!articleTitle) {
      feedback.textContent = "先填文章标题。";
      title.control.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = "保存中...";
    feedback.textContent = "正在发布文章...";

    const now = new Date().toISOString();
    const article = {
      id: crypto.randomUUID(),
      title: articleTitle,
      summary: summary.control.value.trim(),
      body: htmlToPlainText(body.control.innerHTML),
      bodyHtml: normalizeEditorHtml(body.control.innerHTML),
      coverImage: cover.control.value.trim(),
      category: category.control.value.trim() || "随笔",
      tags: splitTags(tags.control.value).slice(0, 12),
      authorRole: isLimitedAdmin() ? "limited" : "admin",
      authorName: isLimitedAdmin() ? "limited" : "admin",
      createdAt: now,
      updatedAt: now,
      featured: Boolean(featured.querySelector("input")?.checked)
    };

    const config = hydrateConfig(state.config);
    const targetPage = config.pages.find((item) => item.id === page.id);
    if (!targetPage) {
      feedback.textContent = "没有找到当前博客分页面。";
      submit.disabled = false;
      submit.textContent = "发布并保存";
      return;
    }

    targetPage.blog = hydrateBlogSection(targetPage.blog);
    targetPage.blog.articles.unshift(article);
    if (!targetPage.blog.categories.includes(article.category)) {
      targetPage.blog.categories.unshift(article.category);
    }

    try {
      await persistConfig(config);
      feedback.textContent = "已发布。";
      renderPublicSite();
    } catch (error) {
      feedback.textContent = error.message;
      submit.disabled = false;
      submit.textContent = "发布并保存";
    }
  });

  panel.append(head, form);
  return panel;
}

function publisherInput(label, type, placeholder) {
  const fieldNode = element("label", "field blog-publisher-field");
  fieldNode.append(element("span", "", label));
  const control = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
  control.className = type === "textarea" ? "textarea" : "input";
  control.placeholder = placeholder || "";
  fieldNode.append(control);
  return { field: fieldNode, control };
}

function publisherImageInput(label, placeholder) {
  const fieldNode = element("div", "field blog-publisher-field blog-publisher-image-field");
  fieldNode.append(element("span", "", label));
  const control = document.createElement("input");
  control.className = "input";
  control.placeholder = placeholder || "";

  const upload = document.createElement("input");
  upload.type = "file";
  upload.accept = "image/*";
  const hint = element("small", "", "可粘贴图片地址，也可以选择本地图片。");
  upload.addEventListener("change", async () => {
    const file = upload.files?.[0];

    if (!file) {
      return;
    }

    upload.disabled = true;
    hint.textContent = "正在处理图片...";

    try {
      control.value = await imageFileToDataUrl(file);
      hint.textContent = "封面已上传到输入框，点击发布并保存即可。";
    } catch (error) {
      hint.textContent = error.message;
    } finally {
      upload.disabled = false;
      upload.value = "";
    }
  });

  fieldNode.append(control, upload, hint);
  return { field: fieldNode, control };
}

function publisherRichTextInput(label, placeholder) {
  const fieldNode = element("div", "field blog-publisher-field blog-publisher-rich-field");
  fieldNode.append(element("span", "", label));
  const editor = createRichTextEditor({
    html: "",
    placeholder,
    onChange: () => {}
  });
  fieldNode.append(editor.wrapper);
  return { field: fieldNode, control: editor.editor };
}

function richTextEditorField(label, value, onChange, disabled = false) {
  const wrapper = element("div", "field rich-editor-field");
  wrapper.append(element("span", "", label));
  const editor = createRichTextEditor({
    html: value,
    placeholder: "像文档一样编辑正文。支持快捷键、粘贴图片和文件。",
    disabled,
    onChange
  });
  wrapper.append(editor.wrapper);
  return wrapper;
}

function createRichTextEditor({ html = "", placeholder = "", disabled = false, onChange = () => {} } = {}) {
  const wrapper = element("div", disabled ? "rich-doc-editor is-disabled" : "rich-doc-editor");
  const toolbar = element("div", "rich-doc-toolbar");
  const editor = element("div", "rich-doc-page");
  const commandTools = [];
  editor.contentEditable = disabled ? "false" : "true";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", "正文");
  editor.setAttribute("aria-multiline", "true");
  if (disabled) editor.setAttribute("aria-readonly", "true");
  editor.dataset.placeholder = placeholder;
  editor.innerHTML = normalizeEditorHtml(html);

  const run = (command, value = null) => {
    if (disabled) return;
    restoreSelection();
    document.execCommand(command, false, value);
    saveSelection();
    updateToolStates();
    notify();
  };

  const tool = (label, command, value = null) => {
    const control = button(label, "button rich-doc-tool", "button");
    control.dataset.command = command;
    if (value) control.dataset.commandValue = value;
    control.addEventListener("mousedown", (event) => event.preventDefault());
    control.addEventListener("click", () => run(command, value));
    commandTools.push(control);
    return control;
  };

  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageInput.multiple = true;
  imageInput.hidden = true;
  imageInput.addEventListener("change", async () => {
    const files = [...(imageInput.files || [])];
    if (!files.length) return;
    await insertFilesIntoEditor(editor, files, restoreSelection);
    imageInput.value = "";
    notify();
  });

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.addEventListener("change", async () => {
    const files = [...(fileInput.files || [])];
    if (!files.length) return;
    await insertFilesIntoEditor(editor, files, restoreSelection);
    fileInput.value = "";
    notify();
  });

  const imageButton = button("图片", "button rich-doc-tool", "button");
  imageButton.addEventListener("click", () => imageInput.click());
  const fileButton = button("文件", "button rich-doc-tool", "button");
  fileButton.addEventListener("click", () => fileInput.click());
  toolbar.append(
    tool("B", "bold"),
    tool("I", "italic"),
    tool("U", "underline"),
    tool("标题", "formatBlock", "h2"),
    tool("引用", "formatBlock", "blockquote"),
    tool("列表", "insertUnorderedList"),
    imageButton,
    fileButton
  );

  const notify = () => {
    const next = normalizeEditorHtml(editor.innerHTML);
    onChange(next);
  };
  let savedRange = null;
  const updateToolStates = () => {
    for (const control of commandTools) {
      const command = control.dataset.command;
      const value = control.dataset.commandValue;
      let active = false;
      try {
        if (command === "formatBlock") {
          const current = String(document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
          active = current === value;
        } else {
          active = document.queryCommandState(command);
        }
      } catch {
        active = false;
      }
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-pressed", String(active));
    }
  };
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
      updateToolStates();
    }
  };
  const restoreSelection = () => {
    if (!savedRange) {
      editor.focus();
      return;
    }
    editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  };

  if (!disabled) {
    trackUndoOnEdit(editor);
    editor.addEventListener("input", () => {
      saveSelection();
      notify();
    });
    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("focus", saveSelection);
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
        saveSelection();
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    state.renderCleanups.push(() => document.removeEventListener("selectionchange", onSelectionChange));
    editor.addEventListener("paste", async (event) => {
      const files = clipboardFiles(event.clipboardData);
      if (!files.length) {
        return;
      }

      event.preventDefault();
      await insertFilesIntoEditor(editor, files, restoreSelection);
      notify();
    });
    editor.addEventListener("drop", async (event) => {
      const files = [...(event.dataTransfer?.files || [])];
      if (!files.length) {
        return;
      }
      event.preventDefault();
      await insertFilesIntoEditor(editor, files, restoreSelection);
      notify();
    });
    editor.addEventListener("dragover", (event) => event.preventDefault());
    editor.addEventListener("keydown", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i" || key === "u") {
        event.preventDefault();
        run(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
      }
    });
  }

  wrapper.append(toolbar, editor, imageInput, fileInput);
  return { wrapper, editor };
}

function clipboardFiles(clipboardData) {
  const files = [...(clipboardData?.files || [])];
  for (const item of clipboardData?.items || []) {
    if (item.kind !== "file") {
      continue;
    }
    const file = item.getAsFile();
    if (file && !files.includes(file)) {
      files.push(file);
    }
  }
  return files;
}

async function insertFilesIntoEditor(editor, files, restoreSelection) {
  restoreSelection();
  for (const file of files) {
    await insertFileIntoEditor(editor, file);
  }
}

async function insertFileIntoEditor(editor, file) {
  const dataUrl = file.type.startsWith("image/") ? await imageFileToDataUrl(file) : await genericFileToDataUrl(file);
  if (file.type.startsWith("image/")) {
    document.execCommand("insertHTML", false, `<figure><img src="${escapeAttribute(dataUrl)}" alt="${escapeAttribute(file.name)}"><figcaption>${escapeHtml(file.name)}</figcaption></figure><p><br></p>`);
    return;
  }

  document.execCommand("insertHTML", false, `<p><a href="${escapeAttribute(dataUrl)}" download="${escapeAttribute(file.name)}">附件：${escapeHtml(file.name)}</a></p>`);
}

function renderArticleContent(article) {
  const body = element("div", "blog-article-rich-body");
  body.innerHTML = articleBodyHtml(article);
  return body;
}

function articleBodyHtml(article) {
  return normalizeEditorHtml(article?.bodyHtml || plainTextToHtml(article?.body || ""));
}

function normalizeEditorHtml(html) {
  const trimmed = String(html || "").trim();
  if (!trimmed || trimmed === "<br>") {
    return "";
  }
  return trimmed;
}

function plainTextToHtml(text) {
  return String(text || "")
    .split(/\n+/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function htmlToPlainText(html) {
  const holder = document.createElement("div");
  holder.innerHTML = html || "";
  return holder.textContent.trim();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function genericFileToDataUrl(file) {
  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("附件太大了，请选择 8MB 以内的文件。");
  }
  return fileToDataUrl(file, file.type.split("/")[0] ? "" : "");
}

function isAdminSession() {
  return Boolean(state.token);
}

function canManageComments(adminMode) {
  return adminMode || isAdminSession();
}

function renderBlogPagePreview(page) {
  const wrapper = element("section", "admin-panel blog-page-preview-panel");
  wrapper.append(element("h2", "", "博客页面预览"));
  wrapper.append(element("p", "", "保存后用户打开这个分页面会看到下面这种整页博客布局，下面圈出来的头部区域可以直接编辑。"));
  const preview = element("div", "blog-page-preview");
  const blog = hydrateBlogSection(page.blog);
  const articles = blog.articles || [];
  const categories = blog.categories?.length ? blog.categories : [...new Set(articles.map((article) => article.category).filter(Boolean))];
  preview.append(renderBlogPreviewInlineEditor(page, blog));
  const tabs = element("nav", "blog-page-tabs");
  tabs.append(element("span", "is-active", "推荐"));
  categories.slice(0, 7).forEach((label) => tabs.append(element("span", "", label)));
  preview.append(tabs);
  const list = element("section", "blog-page-articles");
  articles.slice(0, 4).forEach((article) => list.append(renderBlogListItem(page, blog, article)));
  if (!articles.length) list.append(element("p", "empty-state", "还没有发布文章。"));
  preview.append(list);
  wrapper.append(preview);
  return wrapper;
}

function renderBlogPreviewInlineEditor(page, blog) {
  const panel = element("section", "blog-preview-editor");
  const nav = element("header", "blog-page-nav blog-preview-nav");
  const titleInput = blogPreviewControl("博客名称", page.title || "", (value) => {
    page.title = value;
  });
  nav.append(titleInput.field, element("span", "", "BLOG"));

  const notice = element("section", "blog-page-notice blog-preview-notice");
  notice.append(mark("NB"));
  const noticeInput = blogPreviewControl("公告", blog.notice || "", (value) => {
    blog.notice = value;
    page.blog = blog;
  });
  notice.append(noticeInput.field, element("span", "", "›"));

  const hero = element("section", "blog-page-hero blog-preview-hero");
  const intro = element("article", "blog-page-intro blog-preview-intro");
  const descriptionInput = blogPreviewControl("博客介绍", blog.description || page.description || "", (value) => {
    blog.description = value;
    page.blog = blog;
  }, "textarea");
  const slugInput = blogPreviewControl("页面后缀", page.slug || "", (value) => {
    page.slug = slugify(value);
  });
  const categoriesInput = blogPreviewControl("分类", (blog.categories || []).join(", "), (value) => {
    blog.categories = splitTags(value);
    page.blog = blog;
  });
  intro.append(descriptionInput.field, slugInput.field, categoriesInput.field);
  hero.append(intro);

  panel.append(nav, notice, hero);
  return panel;
}

function blogPreviewControl(label, value, onChange, type = "input") {
  const field = element("label", "blog-preview-field");
  field.append(element("span", "", label));
  const control = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
  control.value = value;
  if (type === "textarea") {
    control.rows = 2;
  }
  trackUndoOnEdit(control);
  control.addEventListener("input", () => {
    onChange(control.value);
    state.saveStatus = "有未保存修改。";
    setSaveBarStatus(state.saveStatus);
  });
  field.append(control);
  return { field, control };
}

function renderBlogHeroArticle(article, large) {
  const item = element("article", large ? "blog-hero-card is-large" : "blog-hero-card");
  if (article.coverImage) {
    item.style.backgroundImage = `linear-gradient(90deg, rgba(9, 13, 17, 0.72), rgba(9, 13, 17, 0.18)), url("${cssUrl(article.coverImage)}")`;
  }
  item.append(
    element("span", "blog-category", article.category || "文章"),
    element("h3", "", article.title || "未命名文章"),
    element("p", "", article.summary || article.body || "还没有摘要。")
  );
  return item;
}

function renderBlogArticleCard(article) {
  const item = element("article", "blog-article-card");
  if (article.coverImage) {
    const image = document.createElement("img");
    image.src = article.coverImage;
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = article.title || "";
    item.append(image);
  }

  const content = element("div", "blog-article-content");
  content.append(
    element("span", "blog-category", article.category || "文章"),
    element("h3", "", article.title || "未命名文章"),
    element("p", "", article.summary || "还没有摘要。"),
    element("small", "", `${article.authorName || article.authorRole || "作者"} · ${formatDateTime(article.createdAt)}`)
  );

  const tags = element("div", "blog-tag-cloud compact");
  for (const tag of article.tags || []) {
    tags.append(element("span", "", tag));
  }
  content.append(tags);

  if (article.body) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "阅读全文";
    const body = element("div", "blog-article-body");
    for (const paragraph of article.body.split(/\n+/).filter(Boolean)) {
      body.append(element("p", "", paragraph));
    }
    details.append(summary, body);
    content.append(details);
  }

  item.append(content);
  return item;
}

function collectBlogTags(articles) {
  return [...new Set(articles.flatMap((article) => article.tags || []).filter(Boolean))];
}

function renderModuleCard(module, context) {
  const card = element("article", "module-card");
  const header = element("header", "module-card-header no-toggle");
  header.append(mark(module.icon), textBlock(module.name, module.description));
  const body = element("div", "module-body");
  body.append(module.mount(context));
  card.append(header, body);
  return card;
}

function renderBlockCard(block) {
  const card = element("article", "module-card");
  const header = element("header", "module-card-header no-toggle");
  header.append(mark(block.icon || "TX"), textBlock(block.title, block.description));
  const body = element("div", "module-body");
  for (const paragraph of block.body.split(/\n+/).filter(Boolean)) {
    body.append(element("p", "", paragraph));
  }
  card.append(header, body);
  return card;
}

function renderImageSection(section) {
  const card = element(
    "article",
    section.display === "background" ? "module-card image-background-section" : "module-card image-section"
  );

  if (section.display === "background" && section.src) {
    card.style.backgroundImage = `linear-gradient(90deg, rgba(23, 32, 29, 0.78), rgba(23, 32, 29, 0.24)), url("${cssUrl(section.src)}")`;
    card.style.backgroundSize = section.fit;
  }

  const header = element("header", "module-card-header no-toggle");
  header.append(mark("IM"), textBlock(section.title || "图片", section.description));
  card.append(header);

  if (section.display === "normal") {
    const frame = element("figure", "image-frame");
    if (section.src) {
      const image = document.createElement("img");
      image.src = section.src;
      image.loading = "lazy";
      image.decoding = "async";
      image.alt = section.alt || section.title || "";
      image.style.objectFit = section.fit;
      frame.append(image);
    } else {
      frame.append(element("div", "image-placeholder", "还没有选择图片"));
    }

    if (section.caption) {
      frame.append(element("figcaption", "", section.caption));
    }

    card.append(frame);
  } else {
    const body = element("div", "module-body");
    body.append(element("p", "", section.caption || section.alt || "背景图片模块"));
    card.append(body);
  }

  return card;
}

function renderVideoSection(section) {
  const card = element("article", "module-card video-section");
  const header = element("header", "module-card-header no-toggle");
  header.append(mark("VD"), textBlock(section.title || "视频", section.description));
  card.append(header);

  const frame = element("figure", "video-frame");
  if (section.src) {
    const video = document.createElement("video");
    video.src = section.src;
    video.controls = true;
    video.disablePictureInPicture = false;
    video.controlsList = "nodownload";
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("x5-playsinline", "");
    video.setAttribute("x-webkit-airplay", "allow");
    const source = document.createElement("source");
    source.src = section.src;
    const mimeType = videoMimeType(section.src);

    if (mimeType) {
      source.type = mimeType;
    }

    video.append(source);

    if (section.poster) {
      video.poster = section.poster;
    }

    const play = button("播放", "button primary video-play-button", "button");
    const startVideo = async () => {
      try {
        if (video.readyState === 0) {
          video.load();
        }
        await video.play();
        play.classList.add("is-hidden");
      } catch {
        play.textContent = "新窗口播放";
        play.onclick = () => window.open(section.src, "_blank", "noopener,noreferrer");
      }
    };
    play.addEventListener("click", startVideo);
    frame.addEventListener("click", (event) => {
      if (event.target === play || event.target === video) {
        return;
      }

      startVideo();
    });
    video.addEventListener("play", () => play.classList.add("is-hidden"));
    video.addEventListener("pause", () => play.classList.remove("is-hidden"));
    frame.append(video, play);
  } else {
    frame.append(element("div", "video-placeholder", "还没有设置视频"));
  }

  if (section.caption) {
    frame.append(element("figcaption", "", section.caption));
  }

  card.append(frame);
  return card;
}

function renderCommentsSection(page, source, adminMode) {
  const card = element("article", adminMode ? "module-card comments-section admin-comments-section" : "module-card comments-section");
  const canManage = canManageComments(adminMode);
  card.style.setProperty("--comments-list-height", `${source.listHeight || 320}px`);
  const header = element("header", "module-card-header no-toggle");
  header.append(mark("CM"), textBlock(source.title || "评论", source.description || "留下你的想法。"));

  const form = element("form", "comment-form");
  const name = document.createElement("input");
  name.className = "input";
  name.name = "name";
  name.placeholder = "你的名字";
  name.maxLength = 40;
  const displayIp = document.createElement("input");
  displayIp.className = "input";
  displayIp.name = "displayIp";
  displayIp.placeholder = "管理员显示 IP（留空自动获取）";
  displayIp.maxLength = 80;
  displayIp.value = adminMode ? localStorage.getItem(`${adminCommentIpKeyPrefix}${page.slug}`) || "" : "";
  displayIp.addEventListener("input", () => {
    localStorage.setItem(`${adminCommentIpKeyPrefix}${page.slug}`, displayIp.value);
  });
  const body = document.createElement("textarea");
  body.className = "textarea";
  body.name = "body";
  body.placeholder = "写下评论...";
  body.maxLength = 1000;
  body.required = true;
  const submit = button("发表评论", "button primary", "submit");
  const feedback = element("p", "form-hint");
  form.append(name);
  if (adminMode) {
    form.append(displayIp);
  }
  form.append(body, submit, feedback);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "提交中";
    feedback.textContent = "";

    try {
      const payload = await api.postJson("/api/comments", {
        page: page.slug,
        name: name.value,
        body: body.value,
        displayIp: adminMode ? displayIp.value : ""
      }, adminMode);
      body.value = "";
      feedback.textContent = "评论已发布。";
      updateCommentCache(page.slug, payload.comments || []);
      refreshCommentLists(page.slug);
    } catch (error) {
      feedback.textContent = error.message;
    }

    submit.disabled = false;
    submit.textContent = "发表评论";
  });

  const list = element("div", "comments-list");
  const adminActions = element("div", "module-actions");

  if (adminMode) {
    const clear = button("清空这个页面的评论", "button danger", "button");
    clear.addEventListener("click", async () => {
      if (!confirm(`确定清空 /${page.slug} 的所有评论？`)) {
        return;
      }

      const payload = await api.postJson("/api/admin/comments", { page: page.slug, action: "clear" }, true);
      updateCommentCache(page.slug, payload.comments || []);
      refreshCommentLists(page.slug);
    });
    adminActions.append(clear);
  }

  card.append(header, form);

  if (adminMode) {
    card.append(adminActions);
  }

  card.append(list);
  loadComments(page.slug, list, canManage);
  return card;
}

function renderCommentsManager(page) {
  const card = element("section", "comments-manager");
  const head = element("div", "section-head action-head");
  const copy = element("div");
  copy.append(element("h2", "", "评论管理"));
  copy.append(element("p", "", "这里可以编辑或删除某一条评论，也可以清空当前分页面的全部评论。"));
  const clear = button("清空评论", "button danger", "button");
  const list = element("div", "comments-list");
  clear.addEventListener("click", async () => {
    if (!confirm(`确定清空 /${page.slug} 的所有评论？`)) {
      return;
    }

    const payload = await api.postJson("/api/admin/comments", { page: page.slug, action: "clear" }, true);
    updateCommentCache(page.slug, payload.comments || []);
    refreshCommentLists(page.slug);
  });
  head.append(copy, clear);
  card.append(head, list);
  loadComments(page.slug, list, true);
  return card;
}

async function loadComments(pageSlug, list, adminMode, options = {}) {
  list.dataset.commentsPage = pageSlug;
  list.dataset.adminMode = adminMode ? "1" : "0";
  list.dataset.canManageComments = adminMode ? "1" : "0";

  if (!options.force && state.commentCache.has(pageSlug)) {
    renderCommentsList(pageSlug, list, adminMode, state.commentCache.get(pageSlug));
    return;
  }

  list.replaceChildren(element("p", "form-hint", "正在加载评论..."));

  try {
    const comments = await getComments(pageSlug, options);
    refreshCommentLists(pageSlug);

    if (!document.body.contains(list)) {
      return;
    }

    renderCommentsList(pageSlug, list, adminMode, comments);
  } catch (error) {
    list.replaceChildren(element("p", "form-error", error.message));
  }
}

async function getComments(pageSlug, options = {}) {
  if (!options.force && state.commentCache.has(pageSlug)) {
    return state.commentCache.get(pageSlug);
  }

  if (!options.force && state.commentRequests.has(pageSlug)) {
    return state.commentRequests.get(pageSlug);
  }

  const request = api
    .getJson(`/api/comments?page=${encodeURIComponent(pageSlug)}`)
    .then((payload) => {
      const comments = payload.comments || [];
      updateCommentCache(pageSlug, comments);
      return comments;
    })
    .finally(() => {
      state.commentRequests.delete(pageSlug);
    });

  state.commentRequests.set(pageSlug, request);
  return request;
}

function updateCommentCache(pageSlug, comments) {
  state.commentCache.set(pageSlug, Array.isArray(comments) ? comments : []);
}

function refreshCommentLists(pageSlug) {
  const comments = state.commentCache.get(pageSlug) || [];

  for (const list of document.querySelectorAll(".comments-list")) {
    if (list.dataset.commentsPage === pageSlug) {
      renderCommentsList(pageSlug, list, list.dataset.canManageComments === "1", comments);
    }
  }
}

function renderCommentsList(pageSlug, list, adminMode, comments) {
  if (!comments.length) {
    list.replaceChildren(element("p", "empty-state", "还没有评论。"));
    return;
  }

  list.replaceChildren(...comments.map((comment) => renderCommentItem(pageSlug, comment, adminMode, list)));
}

function renderCommentItem(pageSlug, comment, adminMode, list) {
  const item = element("article", "comment-item");
  const head = element("div", "comment-head");
  const meta = [comment.ip || "unknown", comment.device || "未知设备", formatDate(comment.createdAt)].join(" · ");
  head.append(element("strong", "", comment.name || "访客"));
  head.append(element("span", "comment-meta", meta));
  const body = element("p", "", comment.body);
  item.append(head, body);

  if (adminMode) {
    const editor = element("div", "comment-editor-host");
    const actions = element("div", "comment-actions");
    const edit = button("编辑", "button", "button");
    const remove = button("删除", "button danger", "button");

    edit.addEventListener("click", () => {
      editor.replaceChildren(renderCommentEditForm(pageSlug, comment, () => {
        editor.replaceChildren();
      }));
    });

    remove.addEventListener("click", async () => {
      if (!confirm("确定删除这条评论？")) {
        return;
      }

      const payload = await api.postJson("/api/admin/comments", { page: pageSlug, action: "delete", id: comment.id }, true);
      updateCommentCache(pageSlug, payload.comments || []);
      refreshCommentLists(pageSlug);
    });

    actions.append(edit, remove);
    item.append(actions, editor);
  }

  return item;
}

function renderCommentEditForm(pageSlug, comment, onCancel) {
  const form = element("form", "comment-edit-form");
  const fields = element("div", "comment-edit-grid");
  const name = document.createElement("input");
  name.className = "input";
  name.name = "name";
  name.maxLength = 40;
  name.placeholder = "评论名字";
  name.value = comment.name || "";
  const ip = document.createElement("input");
  ip.className = "input";
  ip.name = "ip";
  ip.maxLength = 80;
  ip.placeholder = "显示 IP";
  ip.value = comment.ip || "";
  const device = document.createElement("input");
  device.className = "input";
  device.name = "device";
  device.maxLength = 120;
  device.placeholder = "设备信息";
  device.value = comment.device || "";
  const body = document.createElement("textarea");
  body.className = "textarea";
  body.name = "body";
  body.maxLength = 1000;
  body.required = true;
  body.value = comment.body || "";
  const feedback = element("p", "form-hint");
  const controls = element("div", "comment-edit-actions");
  const cancel = button("取消", "button", "button");
  const save = button("保存修改", "button primary", "submit");

  cancel.addEventListener("click", onCancel);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    save.textContent = "保存中";
    feedback.textContent = "";

    try {
      const payload = await api.postJson("/api/admin/comments", {
        page: pageSlug,
        action: "update",
        id: comment.id,
        name: name.value,
        body: body.value,
        ip: ip.value,
        device: device.value
      }, true);
      updateCommentCache(pageSlug, payload.comments || []);
      refreshCommentLists(pageSlug);
    } catch (error) {
      feedback.textContent = error.message;
      save.disabled = false;
      save.textContent = "保存修改";
    }
  });

  fields.append(name, ip, device);
  controls.append(cancel, save);
  form.append(fields, body, controls, feedback);
  return form;
}

function moduleContext(page) {
  const systemIds = page.sections.filter((section) => section.type === "system").map((section) => section.moduleId);
  const enabled = new Map(state.modules.map((module) => [module.id, systemIds.includes(module.id)]));

  return {
    state: {
      modules: state.modules,
      enabled,
      activeFilter: "all",
      activeModuleId: systemIds[0] || ""
    },
    refresh: renderPublicSite,
    api,
    page
  };
}

function hydrateConfig(config) {
  const next = config || fallbackConfig;
  const links = (next.links || fallbackConfig.links).map(hydrateExternalLink);
  const hasCubeCityLink = links.some(
    (link) => link.id === cubeCityLinkId || normalizeInternalPath(link.targetUrl) === cubeCityPath
  );
  if (!hasCubeCityLink) {
    links.push({ ...cubeCityLink });
  }
  const hasLlrMarioRunLink = links.some(
    (link) => link.id === llrMarioRunLinkId || normalizeInternalPath(link.targetUrl) === llrMarioRunPath
  );
  if (!hasLlrMarioRunLink) {
    links.push({ ...llrMarioRunLink });
  }
  const pages = (next.pages || fallbackConfig.pages).map(hydratePage);

  return {
    ...fallbackConfig,
    ...next,
    commentBlockWords: normalizeBlockWordsInput(next.commentBlockWords || []),
    announcement: hydrateAnnouncement(next.announcement),
    links,
    pages,
    navOrder: hydrateNavOrder(next.navOrder, pages, links)
  };
}

function hydrateNavOrder(value, pages, links) {
  const valid = new Set([
    ...pages.map((page) => `page:${page.id}`),
    ...links.map((link) => `link:${link.id}`)
  ]);
  const order = (Array.isArray(value) ? value : [])
    .map((item) => String(item || ""))
    .filter((item) => valid.has(item));
  const used = new Set(order);

  for (const page of pages) {
    const key = `page:${page.id}`;
    if (!used.has(key)) {
      order.push(key);
      used.add(key);
    }
  }

  for (const link of links) {
    const key = `link:${link.id}`;
    if (!used.has(key)) {
      order.push(key);
      used.add(key);
    }
  }

  return order;
}

function normalizeBlockWordsInput(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  const words = source.map((word) => String(word || "").trim().slice(0, 60)).filter(Boolean).slice(0, 200);
  return [...new Set(words)];
}

function hydrateAnnouncement(announcement) {
  return {
    enabled: Boolean(announcement?.enabled),
    title: announcement?.title || "公告",
    text: announcement?.text || announcement?.message || "",
    durationSeconds: clampNumber(Number(announcement?.durationSeconds ?? announcement?.closeAfterSeconds ?? 8), 0, 120)
  };
}

function hydratePage(page) {
  const legacySections = [
    ...(page.modules || []).map((moduleId) => ({
      id: crypto.randomUUID(),
      type: "system",
      moduleId
    })),
    ...(page.blocks || []).map((block) => ({ type: "text", ...block }))
  ];
  const sections = (page.sections?.length ? page.sections : legacySections).map(hydrateSection).filter(Boolean);

  return {
    ...page,
    kind: page.kind === "blog" ? "blog" : "normal",
    sections,
    modules: sections.filter((section) => section.type === "system").map((section) => section.moduleId),
    blocks: sections.filter((section) => section.type === "text"),
    backgroundImage: page.backgroundImage || "",
    dailyBackgroundEnabled: Boolean(page.dailyBackgroundEnabled),
    locked: Boolean(page.locked),
    passwordEnabled: Boolean(page.passwordEnabled),
    pagePassword: page.pagePassword || "",
    entry: hydrateEntry(page.entry),
    comments: hydrateComments(page.comments),
    blog: hydrateBlogSection(page.blog)
  };
}

function hydrateLayout(layout, type = "text") {
  const defaultMinHeight = type === "comments" ? 320 : type === "navigation" ? 420 : 280;

  return {
    width: clampNumber(Number(layout?.width ?? 0), 0, 100),
    minHeight: clampNumber(Number(layout?.minHeight ?? defaultMinHeight), 120, 900),
    locked: Boolean(layout?.locked)
  };
}

function hydrateSection(section) {
  if (!section || typeof section !== "object") {
    return null;
  }

  if (section.type === "system") {
    return {
      id: section.id || crypto.randomUUID(),
      type: "system",
      moduleId: section.moduleId || state.modules[0]?.id || "",
      layout: hydrateLayout(section.layout, "system")
    };
  }

  if (section.type === "image") {
    return {
      id: section.id || crypto.randomUUID(),
      type: "image",
      title: section.title || "图片模块",
      description: section.description || "",
      src: section.src || "",
      alt: section.alt || "",
      caption: section.caption || "",
      display: section.display === "background" ? "background" : "normal",
      fit: section.fit === "contain" ? "contain" : "cover",
      layout: hydrateLayout(section.layout, "image")
    };
  }

  if (section.type === "video") {
    return {
      id: section.id || crypto.randomUUID(),
      type: "video",
      title: section.title || "视频模块",
      description: section.description || "",
      src: section.src || "",
      poster: section.poster || "",
      caption: section.caption || "",
      layout: hydrateLayout(section.layout, "video")
    };
  }

  if (section.type === "p2p") {
    return null;
  }

  if (section.type === "comments") {
    return {
      id: section.id || crypto.randomUUID(),
      type: "comments",
      title: section.title || "评论",
      description: section.description || "留下你的想法。",
      listHeight: clampNumber(Number(section.listHeight ?? 320), 180, 900),
      layout: hydrateLayout(section.layout, "comments")
    };
  }

  if (section.type === "link") {
    return {
      id: section.id || crypto.randomUUID(),
      type: "link",
      title: section.title || "网站入口",
      description: section.description || "",
      targetUrl: normalizeExternalUrl(section.targetUrl || ""),
      iconText: (section.iconText || "WEB").slice(0, 4).toUpperCase(),
      iconImage: section.iconImage || "",
      backgroundImage: section.backgroundImage || "",
      layout: hydrateLayout(section.layout, "link")
    };
  }

  if (section.type === "navigation") {
    return {
      id: section.id || crypto.randomUUID(),
      type: "navigation",
      title: String(section.title || "导航").slice(0, 80),
      items: (Array.isArray(section.items) ? section.items : [])
        .slice(0, 100)
        .map((item) => ({
          id: item?.id || crypto.randomUUID(),
          name: String(item?.name || "").slice(0, 80),
          url: normalizeExternalUrl(item?.url || "")
        }))
        .filter((item) => item.name || item.url),
      layout: hydrateLayout(section.layout, "navigation")
    };
  }

  if (section.type === "article") {
    return {
      id: section.id || crypto.randomUUID(),
      type: "article",
      articlePath: normalizeArticlePath(section.articlePath || ""),
      layout: hydrateLayout(section.layout, "article")
    };
  }

  if (section.type === "blog") {
    return {
      id: section.id || crypto.randomUUID(),
      type: "blog",
      title: section.title || "博客",
      description: section.description || "发布文章和记录。",
      notice: section.notice || "",
      profileName: section.profileName || "站长",
      profileDescription: section.profileDescription || "这里是博客作者介绍。",
      profileImage: section.profileImage || "",
      categories: Array.isArray(section.categories) ? section.categories : [],
      articles: Array.isArray(section.articles) ? section.articles.map(hydrateBlogArticle) : [],
      layout: hydrateLayout(section.layout, "blog")
    };
  }

  return {
    id: section.id || crypto.randomUUID(),
    type: "text",
    icon: section.icon || "TX",
    title: section.title || "文本模块",
    description: section.description || "",
    body: section.body || "",
    layout: hydrateLayout(section.layout, "text")
  };
}

function hydrateBlogArticle(article) {
  const now = new Date().toISOString();
  const authorRole = article?.authorRole === "admin" ? "admin" : article?.authorRole === "public" ? "public" : "limited";
  return {
    id: article?.id || crypto.randomUUID(),
    title: article?.title || "未命名文章",
    summary: article?.summary || "",
    body: article?.body || "",
    bodyHtml: article?.bodyHtml || "",
    coverImage: article?.coverImage || "",
    category: article?.category || "随笔",
    tags: Array.isArray(article?.tags) ? article.tags : splitTags(article?.tags || ""),
    authorRole,
    authorName: article?.authorName || (authorRole === "admin" ? "admin" : authorRole === "public" ? "匿名" : "limited"),
    createdAt: article?.createdAt || now,
    updatedAt: article?.updatedAt || article?.createdAt || now,
    featured: Boolean(article?.featured)
  };
}

function hydrateBlogSection(blog) {
  return {
    id: blog?.id || crypto.randomUUID(),
    type: "blog",
    title: blog?.title || "博客",
    description: blog?.description || "收录文章、笔记和日常。",
    notice: blog?.notice || "",
    profileName: blog?.profileName || "站长",
    profileDescription: blog?.profileDescription || "这里是博客作者介绍。",
    profileImage: blog?.profileImage || "",
    categories: Array.isArray(blog?.categories) ? blog.categories : ["推荐", "教程", "日常"],
    articles: Array.isArray(blog?.articles) ? blog.articles.map(hydrateBlogArticle) : [],
    layout: hydrateLayout(blog?.layout, "blog")
  };
}

function hydrateEntry(entry) {
  return {
    title: entry?.title || "",
    description: entry?.description || "",
    iconText: (entry?.iconText || "PG").slice(0, 4).toUpperCase(),
    iconImage: entry?.iconImage || "",
    sidebarTitle: entry?.sidebarTitle || "",
    sidebarDescription: entry?.sidebarDescription || "",
    sidebarIconText: (entry?.sidebarIconText || "").slice(0, 4).toUpperCase(),
    sidebarIconImage: entry?.sidebarIconImage || "",
    backgroundImage: entry?.backgroundImage || ""
  };
}

function hydrateComments(comments) {
  return {
    enabled: comments?.enabled !== false,
    mode: comments?.mode === "module" ? "module" : "bottom",
    title: comments?.title || "评论",
    description: comments?.description || "留下你的想法。",
    listHeight: clampNumber(Number(comments?.listHeight ?? 320), 180, 900),
    layout: hydrateLayout(comments?.layout, "comments")
  };
}

function hydrateExternalLink(link) {
  return {
    id: link?.id || crypto.randomUUID(),
    title: link?.title || "网站入口",
    description: link?.description || "",
    targetUrl: link?.targetUrl || link?.url || "",
    visible: link?.visible !== false,
    iconText: normalizeExternalLinkIconText(link?.iconText || "WEB"),
    iconImage: link?.iconImage || "",
    backgroundImage: link?.backgroundImage || ""
  };
}

function normalizeExternalLinkIconText(value) {
  return Array.from(String(value || "WEB"))
    .slice(0, externalLinkIconTextMaxLength)
    .join("")
    .toUpperCase();
}

function normalizeExternalLinkIconTextInput(value) {
  return Array.from(String(value || ""))
    .slice(0, externalLinkIconTextMaxLength)
    .join("")
    .toUpperCase();
}

function ensureAdminSelection() {
  const links = state.config.links || [];
  const pageExists = state.config.pages.some((page) => page.id === state.selectedPageId);
  const linkExists = links.some((link) => link.id === state.selectedLinkId);

  if (isLimitedAdmin()) {
    if (state.selectedItemType === "page" && pageExists) {
      return;
    }

    state.selectedItemType = "page";
    state.selectedPageId = state.config.pages[0]?.id || "";
    return;
  }

  if (state.selectedItemType === "logs" || state.selectedItemType === "home") {
    return;
  }

  if (state.selectedItemType === "page" && pageExists) {
    return;
  }

  if (state.selectedItemType === "link" && linkExists) {
    return;
  }

  state.selectedItemType = "page";
  state.selectedPageId = state.config.pages[0]?.id || "";
  state.selectedLinkId = links[0]?.id || "";
}

function isLimitedAdmin() {
  return state.adminRole === "limited";
}

function getSelectedAdminItem() {
  if (state.selectedItemType === "home") {
    return { type: "home" };
  }

  if (state.selectedItemType === "logs") {
    return { type: "logs" };
  }

  if (state.selectedItemType === "link") {
    const link = state.config.links.find((item) => item.id === state.selectedLinkId);

    if (link) {
      return { type: "link", link };
    }
  }

  const page = getSelectedPage();
  return page ? { type: "page", page } : null;
}

function getSelectedPage() {
  return state.config.pages.find((page) => page.id === state.selectedPageId) || state.config.pages[0] || null;
}

function adminNavItems() {
  const pages = new Map(state.config.pages.map((page) => [page.id, page]));
  const links = new Map(state.config.links.map((link) => [link.id, link]));
  return hydrateNavOrder(state.config.navOrder, state.config.pages, state.config.links).map((key) => {
    const [type, id] = key.split(":");
    if (type === "link" && links.has(id)) {
      return { type: "link", key, link: links.get(id) };
    }
    if (type === "page" && pages.has(id)) {
      return { type: "page", key, page: pages.get(id) };
    }
    return null;
  }).filter(Boolean);
}

function appendNavOrder(key) {
  state.config.navOrder = hydrateNavOrder(state.config.navOrder, state.config.pages, state.config.links);
  if (!state.config.navOrder.includes(key)) {
    state.config.navOrder.push(key);
  }
}

function removeNavOrder(key) {
  state.config.navOrder = hydrateNavOrder(state.config.navOrder, state.config.pages, state.config.links)
    .filter((item) => item !== key);
}

function createPage() {
  const index = state.config.pages.length + 1;

  return {
    id: crypto.randomUUID(),
    slug: uniqueClientSlug(`page-${index}`),
    kind: "normal",
    title: `新分页面 ${index}`,
    description: "在这里填写页面说明。",
    backgroundImage: "",
    dailyBackgroundEnabled: false,
    locked: false,
    passwordEnabled: false,
    pagePassword: "",
    visible: true,
    entry: {
      title: "",
      description: "",
      iconText: "PG",
      iconImage: "",
      sidebarTitle: "",
      sidebarDescription: "",
      sidebarIconText: "",
      sidebarIconImage: "",
      backgroundImage: ""
    },
    comments: {
      enabled: true,
      mode: "bottom",
      title: "评论",
      description: "留下你的想法。",
      listHeight: 320,
      layout: hydrateLayout(null, "comments")
    },
    modules: [],
    blocks: [],
    sections: []
  };
}

function createBlogPage() {
  const index = state.config.pages.length + 1;
  const page = createPage();
  page.slug = uniqueClientSlug(`blog-${index}`);
  page.kind = "blog";
  page.title = "博客";
  page.description = "收录文章、笔记和日常。";
  page.entry.iconText = "BG";
  page.entry.sidebarIconText = "BG";
  page.comments.enabled = false;
  page.blog = createBlogSection();
  page.blog.title = "BLOG";
  page.blog.description = "收录开源、好用的互联网项目。";
  page.blog.notice = "这里可以放最新公告或更新说明。";
  return page;
}

function createExternalLink() {
  const index = state.config.links.length + 1;

  return {
    id: crypto.randomUUID(),
    title: `网站入口 ${index}`,
    description: "点击前往外部网站。",
    targetUrl: "",
    visible: true,
    iconText: "WEB",
    iconImage: "",
    backgroundImage: ""
  };
}

function createSystemSection() {
  return {
    id: crypto.randomUUID(),
    type: "system",
    moduleId: state.modules[0]?.id || "",
    layout: hydrateLayout(null, "system")
  };
}

function createTextSection() {
  return {
    id: crypto.randomUUID(),
    type: "text",
    icon: "TX",
    title: "文本模块",
    description: "简短说明",
    body: "在这里编辑正文。",
    layout: hydrateLayout(null, "text")
  };
}

function createImageSection() {
  return {
    id: crypto.randomUUID(),
    type: "image",
    title: "图片模块",
    description: "上传图片或粘贴图片地址。",
    src: "",
    alt: "",
    caption: "",
    display: "normal",
    fit: "cover",
    layout: hydrateLayout(null, "image")
  };
}

function createVideoSection() {
  return {
    id: crypto.randomUUID(),
    type: "video",
    title: "视频模块",
    description: "点击播放视频。",
    src: "",
    poster: "",
    caption: "",
    layout: hydrateLayout(null, "video")
  };
}

function createP2PSection() {
  return {
    id: crypto.randomUUID(),
    type: "p2p",
    title: "P2P 文件传输",
    description: "进入房间后尝试点对点传文件。",
    room: `room-${Math.random().toString(36).slice(2, 8)}`,
    layout: hydrateLayout(null, "p2p")
  };
}

function createCommentsSection() {
  return {
    id: crypto.randomUUID(),
    type: "comments",
    title: "评论",
    description: "留下你的想法。",
    listHeight: 320,
    layout: hydrateLayout(null, "comments")
  };
}

function createLinkSection() {
  return {
    id: crypto.randomUUID(),
    type: "link",
    title: "网站入口",
    description: "点击前往目标网站。",
    targetUrl: "",
    iconText: "WEB",
    iconImage: "",
    backgroundImage: "",
    layout: hydrateLayout(null, "link")
  };
}

function createNavigationSection() {
  return {
    id: crypto.randomUUID(),
    type: "navigation",
    title: "常用导航",
    items: [
      {
        id: crypto.randomUUID(),
        name: "示例网站",
        url: "https://example.com/"
      }
    ],
    layout: hydrateLayout(null, "navigation")
  };
}

function createArticleSection() {
  return {
    id: crypto.randomUUID(),
    type: "article",
    articlePath: "",
    layout: hydrateLayout(null, "article")
  };
}

function createBlogSection() {
  return {
    id: crypto.randomUUID(),
    type: "blog",
    title: "博客",
    description: "发布文章和记录。",
    notice: "欢迎来到我的博客。",
    profileName: "站长",
    profileDescription: "这里是博客作者介绍。",
    profileImage: "",
    categories: ["推荐", "教程", "日常"],
    articles: [],
    layout: hydrateLayout(null, "blog")
  };
}

function insertSection(page, index, section) {
  if (isLimitedAdmin() && page.locked) {
    state.saveStatus = "这个分页面已锁定，低权限管理员不能添加模块。";
    renderAdminEditor();
    return;
  }

  rememberConfigChange();
  page.sections.splice(index, 0, section);
  state.expandedSections.add(section.id);
  renderAdminEditor();
  requestAnimationFrame(() => {
    const added = [...document.querySelectorAll("[data-section-id]")].find((node) => node.dataset.sectionId === section.id);
    if (!added) return;
    added.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
    added.querySelector(".section-toggle")?.focus({ preventScroll: true });
  });
}

function duplicateSection(page, index) {
  const source = page.sections[index];
  if (!source) return;

  if (isLimitedAdmin() && (page.locked || source.layout?.locked)) {
    state.saveStatus = "锁定的模块不能复制。";
    renderAdminEditor();
    return;
  }

  insertSection(page, index + 1, cloneSection(source));
}

function cloneSection(section) {
  const copy = typeof structuredClone === "function"
    ? structuredClone(section)
    : JSON.parse(JSON.stringify(section));

  const refreshIds = (value) => {
    if (!value || typeof value !== "object") return;
    if (Object.prototype.hasOwnProperty.call(value, "id")) {
      value.id = crypto.randomUUID();
    }
    for (const child of Object.values(value)) refreshIds(child);
  };

  refreshIds(copy);
  return copy;
}
function moveSection(page, index, direction) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= page.sections.length) {
    return;
  }

  if (isLimitedAdmin() && (page.locked || page.sections[index]?.layout?.locked || page.sections[nextIndex]?.layout?.locked)) {
    state.saveStatus = "锁定的模块不能移动或被跨过。";
    renderAdminEditor();
    return;
  }

  rememberConfigChange();
  const [section] = page.sections.splice(index, 1);
  page.sections.splice(nextIndex, 0, section);
  renderAdminEditor();
}

function moveSectionTo(page, index, nextIndex) {
  const targetIndex = Math.max(0, Math.min(page.sections.length - 1, nextIndex));

  if (targetIndex === index) {
    return;
  }

  if (isLimitedAdmin() && (page.locked || page.sections[index]?.layout?.locked)) {
    state.saveStatus = "锁定的模块不能移动。";
    renderAdminEditor();
    return;
  }

  const start = Math.min(index, targetIndex);
  const end = Math.max(index, targetIndex);
  const crossesLocked = page.sections.slice(start, end + 1).some((section, sectionIndex) => {
    const actualIndex = start + sectionIndex;
    return isLimitedAdmin() && actualIndex !== index && section.layout?.locked;
  });

  if (crossesLocked) {
    state.saveStatus = "不能跨过已锁定模块。";
    renderAdminEditor();
    return;
  }

  rememberConfigChange();
  const [section] = page.sections.splice(index, 1);
  page.sections.splice(targetIndex, 0, section);
  renderAdminEditor();
}

async function deletePage(page) {
  if (isLimitedAdmin()) return;
  if (state.config.pages.length <= 1) {
    notify("至少需要保留一个分页面。", { error: true });
    return;
  }
  const yes = await confirmAction({ title: `删除“${page.title}”？`, description: "页面及其内容会在保存后从网站移除。保存前仍可使用撤销恢复。", confirmLabel: "删除页面", destructive: true });
  if (!yes) return;
  rememberConfigChange();
  state.config.pages = state.config.pages.filter(item => item.id !== page.id);
  removeNavOrder(`page:${page.id}`);
  state.selectedPageId = state.config.pages[0]?.id || "";
  state.adminTab = "content";
  state.expandedSettings = "";
  renderAdminEditor();
  notify("页面已移除，保存后生效。");
}


function reorderPageById(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId || isLimitedAdmin()) {
    return;
  }

  const sourceIndex = state.config.pages.findIndex((page) => page.id === sourceId);
  const targetIndex = state.config.pages.findIndex((page) => page.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  rememberConfigChange();
  const [page] = state.config.pages.splice(sourceIndex, 1);
  state.config.pages.splice(targetIndex, 0, page);
  state.selectedItemType = "page";
  state.selectedPageId = page.id;
  state.expandedSettings = "";
  renderAdminEditor();
}

function reorderNavByKey(sourceKey, targetKey) {
  if (!sourceKey || !targetKey || sourceKey === targetKey || isLimitedAdmin()) {
    return;
  }

  const order = hydrateNavOrder(state.config.navOrder, state.config.pages, state.config.links);
  const sourceIndex = order.indexOf(sourceKey);
  const targetIndex = order.indexOf(targetKey);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  rememberConfigChange();
  const [item] = order.splice(sourceIndex, 1);
  order.splice(targetIndex, 0, item);
  state.config.navOrder = order;
  const [type, id] = item.split(":");
  state.selectedItemType = type === "link" ? "link" : "page";
  state.selectedLinkId = type === "link" ? id : state.selectedLinkId;
  state.selectedPageId = type === "page" ? id : state.selectedPageId;
  state.expandedSettings = "";
  renderAdminEditor();
}

function attachPointerSort(handle, group, type, sourceId, container) {
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let dragging = false;
  let targetId = "";

  const clearTargets = () => {
    for (const node of container.querySelectorAll(".admin-page-nav-item")) {
      node.classList.remove("is-drop-target");
    }
  };

  const finish = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", finish);
    group.classList.remove("is-dragging");
    clearTargets();
    targetId = targetId || nearestSortTargetId(container, type, sourceId, lastY);

    if (dragging && targetId && targetId !== sourceId) {
      handle.dataset.dragConsumed = "true";
      if (type === "nav") {
        reorderNavByKey(sourceId, targetId);
      } else if (type === "link") {
        reorderLinkById(sourceId, targetId);
      }
    }

    dragging = false;
    targetId = "";
  };

  const move = (event) => {
    lastX = event.clientX;
    lastY = event.clientY;
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (!dragging && distance < 8) {
      return;
    }

    event.preventDefault();
    dragging = true;
    group.classList.add("is-dragging");
    clearTargets();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(sortTargetSelector(type))
      || sortTargetByPosition(container, type, sourceId, event.clientY);
    targetId = sortTargetKey(target, type);
    if (target && targetId !== sourceId) {
      target.classList.add("is-drop-target");
    }
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isLimitedAdmin()) {
      return;
    }

    event.preventDefault();
    startX = event.clientX;
    startY = event.clientY;
    lastX = event.clientX;
    lastY = event.clientY;
    dragging = false;
    targetId = "";
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
  });
}

function sortTargetByPosition(container, type, sourceId, y) {
  const targets = [...container.querySelectorAll(sortTargetSelector(type))]
    .filter((node) => sortTargetKey(node, type) !== sourceId);

  if (!targets.length) {
    return null;
  }

  return targets.reduce((nearest, node) => {
    const rect = node.getBoundingClientRect();
    const distance = Math.abs(y - (rect.top + rect.height / 2));
    return !nearest || distance < nearest.distance ? { node, distance } : nearest;
  }, null)?.node || null;
}

function nearestSortTargetId(container, type, sourceId, y) {
  const target = sortTargetByPosition(container, type, sourceId, y);
  return sortTargetKey(target, type);
}

function sortTargetSelector(type) {
  return type === "nav" ? "[data-nav-key]" : `[data-${type}-id]`;
}

function sortTargetKey(target, type) {
  if (!target) {
    return "";
  }

  return type === "nav" ? target.dataset.navKey || "" : target.dataset?.[`${type}Id`] || "";
}

function isDragPayload(event, type) {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes("text/plain") || types.includes("Text");
}

function readDragPayload(event, type) {
  const value = event.dataTransfer?.getData("text/plain") || event.dataTransfer?.getData("Text") || "";
  const prefix = `${type}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : "";
}

function reorderLinkById(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId || isLimitedAdmin()) {
    return;
  }

  const sourceIndex = state.config.links.findIndex((link) => link.id === sourceId);
  const targetIndex = state.config.links.findIndex((link) => link.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  rememberConfigChange();
  const [link] = state.config.links.splice(sourceIndex, 1);
  state.config.links.splice(targetIndex, 0, link);
  state.selectedItemType = "link";
  state.selectedLinkId = link.id;
  state.expandedSettings = "";
  renderAdminEditor();
}

function reorderBlogArticle(section, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) {
    return;
  }

  const sourceIndex = section.articles.findIndex((article) => article.id === sourceId);
  const targetIndex = section.articles.findIndex((article) => article.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  const source = section.articles[sourceIndex];
  const target = section.articles[targetIndex];

  if (isLimitedAdmin() && (source.authorRole === "admin" || target.authorRole === "admin")) {
    state.saveStatus = "admin 发布的文章只有 admin 可以调整顺序。";
    renderAdminEditor();
    return;
  }

  rememberConfigChange();
  reorderArticleArray(section.articles, sourceId, targetId);
  renderAdminEditor();
}

async function deleteExternalLink(link) {
  if (isLimitedAdmin()) return;
  const yes = await confirmAction({ title: `删除“${link.title}”入口？`, description: "入口会在保存后从首页与导航移除。保存前可使用撤销恢复。", confirmLabel: "删除入口", destructive: true });
  if (!yes) return;
  rememberConfigChange();
  state.config.links = state.config.links.filter(item => item.id !== link.id);
  removeNavOrder(`link:${link.id}`);
  state.selectedItemType = "home";
  state.adminTab = "content";
  state.selectedLinkId = state.config.links[0]?.id || "";
  renderAdminEditor();
  notify("入口已移除，保存后生效。");
}
function sectionLabel(section) {
  if (section.type === "system") {
    return state.modules.find((module) => module.id === section.moduleId)?.name || "系统模块";
  }

  if (section.type === "image") {
    return section.title || "图片模块";
  }

  if (section.type === "video") {
    return section.title || "视频模块";
  }

  if (section.type === "p2p") {
    return section.title || "传输模块";
  }

  if (section.type === "link") {
    return section.title || "网站模块";
  }

  if (section.type === "navigation") {
    return section.title || "导航模块";
  }

  if (section.type === "article") {
    return resolveArticleReference(section.articlePath)?.article?.title || "文章模块";
  }

  if (section.type === "comments") {
    return section.title || "评论模块";
  }

  if (section.type === "blog") {
    return section.title || "博客模块";
  }

  return section.title || "文本模块";
}

function splitTags(value) {
  return String(value || "")
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function formatDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function field(label, value, onInput, hint = "", options = {}) {
  const wrapper = element("label", "field");
  wrapper.append(element("span", "", label));
  const input = document.createElement("input");
  input.setAttribute("aria-label", label);
  input.className = "input";
  input.type = options.type || "text";
  if (options.autocomplete) input.autocomplete = options.autocomplete;
  input.value = value || "";
  if (Number.isInteger(options.maxLength) && options.maxLength > 0) {
    input.maxLength = options.maxLength;
  }
  trackUndoOnEdit(input);
  input.addEventListener("input", () => {
    const nextValue = typeof options.normalize === "function"
      ? options.normalize(input.value)
      : input.value;
    if (nextValue !== input.value) {
      input.value = nextValue;
    }
    onInput(nextValue);
    markConfigDirty();
  });
  wrapper.append(input);

  if (hint) {
    wrapper.append(element("small", "", hint));
  }

  return wrapper;
}

function sidebarField(label, value, onInput, hint = "", disabled = false) {
  const wrapper = element("label", "sidebar-field");
  wrapper.append(element("span", "", label));
  const input = document.createElement("input");
  input.setAttribute("aria-label", label);
  input.value = value || "";
  input.disabled = disabled;
  trackUndoOnEdit(input);
  input.addEventListener("input", () => {
    onInput(input.value);
    markConfigDirty();
  });
  wrapper.append(input);
  if (hint) wrapper.append(element("small", "", hint));
  return wrapper;
}

function sidebarAreaField(label, value, onInput, disabled = false) {
  const wrapper = element("label", "sidebar-field");
  wrapper.append(element("span", "", label));
  const textarea = document.createElement("textarea");
  textarea.setAttribute("aria-label", label);
  textarea.value = value || "";
  textarea.disabled = disabled;
  trackUndoOnEdit(textarea);
  textarea.addEventListener("input", () => {
    onInput(textarea.value);
    markConfigDirty();
  });
  wrapper.append(textarea);
  return wrapper;
}

function areaField(label, value, onInput, hint = "") {
  const wrapper = element("label", "field");
  wrapper.append(element("span", "", label));
  const textarea = document.createElement("textarea");
  textarea.setAttribute("aria-label", label);
  textarea.className = "textarea";
  textarea.value = value || "";
  trackUndoOnEdit(textarea);
  textarea.addEventListener("input", () => {
    onInput(textarea.value);
    markConfigDirty();
  });
  wrapper.append(textarea);
  if (hint) {
    wrapper.append(element("small", "", hint));
  }
  return wrapper;
}

function selectField(label, value, options, onChange) {
  const wrapper = element("label", "field");
  wrapper.append(element("span", "", label));
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  select.className = "input";

  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  }

  select.value = value;
  select.addEventListener("change", () => {
    rememberConfigChange();
    onChange(select.value);
  });
  wrapper.append(select);
  return wrapper;
}

function numberField(label, value, min, max, step, onChange) {
  const wrapper = element("label", "field");
  wrapper.append(element("span", "", label));
  const input = document.createElement("input");
  input.setAttribute("aria-label", label);
  input.className = "input";
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value ?? min);
  input.addEventListener("change", () => {
    const next = clampNumber(Number(input.value), min, max);
    input.value = String(next);
    rememberConfigChange();
    onChange(next);
  });
  wrapper.append(input);
  return wrapper;
}

function checkbox(label, checked, onChange, disabled = false) {
  const wrapper = element("label", "check-row");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener("change", () => {
    rememberConfigChange();
    onChange(input.checked);
  });
  wrapper.append(input, element("span", "", label));
  return wrapper;
}

function compactTextField(label, value, onInput, hint = "") {
  const wrapper = element("label", "field compact-field");
  wrapper.append(element("span", "", label));
  const input = document.createElement("input");
  input.setAttribute("aria-label", label);
  input.className = "input";
  input.value = value || "";
  trackUndoOnEdit(input);
  input.addEventListener("input", () => {
    onInput(input.value);
    markConfigDirty();
  });
  wrapper.append(input);
  if (hint) wrapper.append(element("small", "", hint));
  return wrapper;
}

function compactAreaField(label, value, onInput, hint = "") {
  const wrapper = element("label", "field compact-field");
  wrapper.append(element("span", "", label));
  const textarea = document.createElement("textarea");
  textarea.setAttribute("aria-label", label);
  textarea.className = "textarea";
  textarea.value = value || "";
  textarea.rows = 3;
  trackUndoOnEdit(textarea);
  textarea.addEventListener("input", () => {
    onInput(textarea.value);
    markConfigDirty();
  });
  wrapper.append(textarea);
  if (hint) wrapper.append(element("small", "", hint));
  return wrapper;
}

function compactImageValueField(label, value, onChange, options = {}) {
  const wrapper = element("div", "compact-image-field");
  const preview = element("span", "compact-image-preview");
  const status = element("span", "compact-image-status");
  const paste = document.createElement("input");
  paste.className = "input compact-image-url";
  paste.placeholder = "可选：粘贴图片地址后回车";
  paste.setAttribute("aria-label", `${label}地址`);
  paste.value = value && !value.startsWith("data:") ? value : "";

  const applyValue = (nextValue, message = "有未保存修改。") => {
    onChange(nextValue);
    updateCompactImagePreview(preview, status, nextValue);
    if (options.onPreview) options.onPreview(nextValue);
    markConfigDirty(message);
  };

  const head = element("div", "compact-image-head");
  head.append(element("strong", "", label), status);
  wrapper.append(head, preview);

  trackUndoOnEdit(paste);
  paste.addEventListener("change", () => {
    rememberConfigChange();
    applyValue(paste.value.trim());
  });

  const upload = document.createElement("input");
  upload.type = "file";
  upload.accept = "image/*";
  upload.hidden = true;
  const uploadButton = button("上传", "button", "button");
  uploadButton.addEventListener("click", () => upload.click());
  upload.addEventListener("change", async () => {
    const file = upload.files?.[0];
    if (!file) return;

    rememberConfigChange();
    state.mediaPending += 1;
    state.saveStatus = "正在处理图片…";
    setSaveBarStatus(state.saveStatus, true);
    uploadButton.disabled = true;

    try {
      const dataUrl = await imageFileToDataUrl(file, imageProfileForLabel(label));
      paste.value = "";
      applyValue(dataUrl, "图片已加入预览，记得保存配置。");
    } catch (error) {
      state.saveStatus = error.message;
      setSaveBarStatus(state.saveStatus);
    } finally {
      uploadButton.disabled = false;
      upload.value = "";
      state.mediaPending -= 1;
      setSaveBarStatus(state.saveStatus);
    }
  });

  const clear = button("清除", "button", "button");
  clear.addEventListener("click", () => {
    rememberConfigChange();
    paste.value = "";
    applyValue("");
  });
  const actions = element("div", "compact-image-actions");
  actions.append(uploadButton, clear);
  wrapper.append(actions, paste, upload);
  if (options.hint) wrapper.append(element("small", "", options.hint));
  updateCompactImagePreview(preview, status, value);
  return wrapper;
}

function updateCompactImagePreview(preview, status, value) {
  preview.style.backgroundImage = value ? `url("${cssUrl(value)}")` : "";
  preview.classList.toggle("has-image", Boolean(value));
  status.textContent = value ? (value.startsWith("data:") ? "已上传图片" : "已设置地址") : "未设置";
}

function imageValueField(label, value, onChange) {
  return compactImageValueField(label, value, onChange);
}

function imageProfileForLabel(label) {
  if (/图标|头像/.test(label)) {
    return { maxSize: 192, quality: 0.8 };
  }

  if (/背景|封面|海报/.test(label)) {
    return { maxSize: 960, quality: 0.78 };
  }

  if (/主页展示/.test(label)) {
    return { maxSize: 1280, quality: 0.8 };
  }

  return {};
}

async function imageFileToDataUrl(file, profile = {}) {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件。");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const maxSize = profile.maxSize || 1400;
    const quality = profile.quality || 0.82;
    const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const webp = canvas.toDataURL("image/webp", quality);
    return webp.startsWith("data:image/webp")
      ? webp
      : canvas.toDataURL("image/jpeg", Math.min(0.9, quality + 0.04));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function fileToDataUrl(file, expectedPrefix) {
  if (!file.type.startsWith(expectedPrefix)) {
    throw new Error(expectedPrefix === "video/" ? "请选择视频文件。" : "文件类型不正确。");
  }

  const maxBytes = 18 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("视频太大了，请上传 18MB 以内的视频，或使用视频外链。");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("文件读取失败。"));
    reader.readAsDataURL(file);
  });
}

function videoMimeType(src) {
  if (!src) {
    return "";
  }

  const dataMatch = src.match(/^data:([^;,]+)/);
  if (dataMatch) {
    return dataMatch[1];
  }

  const clean = src.split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith(".mp4") || clean.endsWith(".m4v")) return "video/mp4";
  if (clean.endsWith(".webm")) return "video/webm";
  if (clean.endsWith(".ogv") || clean.endsWith(".ogg")) return "video/ogg";
  if (clean.endsWith(".mov")) return "video/quicktime";
  return "";
}

function videoFileToPoster(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = objectUrl;

    const cleanup = () => URL.revokeObjectURL(objectUrl);
    video.addEventListener("loadeddata", () => {
      try {
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        const maxSize = 1280;
        const ratio = Math.min(1, maxSize / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        cleanup();
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        cleanup();
        reject(new Error("视频封面生成失败。"));
      }
    });
    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("视频读取失败。"));
    });
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败。"));
    image.src = src;
  });
}

function navLink(href, icon, title, description, active, options = {}) {
  const link = document.createElement("a");
  link.className = active ? "is-active" : "";
  link.href = href;

  if (options.external) {
    link.classList.add("is-external");
    link.rel = "noreferrer";
  }

  if (active) link.setAttribute("aria-current", "page");
  link.append(iconMark(icon, options.iconImage || "", options.fallbackIcon || ""), textBlock(title, description));
  return link;
}

function button(label, className, type) {
  const control = document.createElement("button");
  control.type = type;
  control.className = className;
  control.textContent = label;
  return control;
}

function mark(value) {
  return element("span", "module-icon", value);
}

function entryMark(entry) {
  return iconMark(entry.iconText || "PG", entry.iconImage || "");
}

function pageSidebarMark(page) {
  return iconMark(
    page.entry.sidebarIconText || page.entry.iconText || (page.visible ? "PG" : "HD"),
    page.entry.sidebarIconImage || page.entry.iconImage || ""
  );
}

function sidebarPageTitle(page) {
  return page.entry.sidebarTitle || page.entry.title || page.title;
}

function sidebarPageDescription(page) {
  return page.entry.sidebarDescription || `/${page.slug}`;
}

function linkMark(link) {
  return iconMark(link.iconText || "WEB", link.iconImage || "", faviconUrl(link.targetUrl));
}

const iconImageObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        loadIconImage(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "96px" })
  : null;

function iconMark(text, image, fallbackImage = "") {
  const fallbackText = text || "WEB";
  const icon = element("span", "module-icon entry-icon", fallbackText);
  const src = image || fallbackImage;
  icon.classList.toggle("has-long-text", Array.from(fallbackText).length > 4);

  if (src) {
    icon.dataset.iconImage = src;
    icon.dataset.iconFallback = fallbackText;

    if (iconImageObserver) {
      iconImageObserver.observe(icon);
    } else {
      loadIconImage(icon);
    }
  }

  return icon;
}

function loadIconImage(icon) {
  const src = icon.dataset.iconImage;
  const fallback = icon.dataset.iconFallback || "WEB";

  if (!src) return;
  delete icon.dataset.iconImage;
  delete icon.dataset.iconFallback;

  const image = new Image();
  image.alt = "";
  image.width = 42;
  image.height = 42;
  image.decoding = "async";
  image.fetchPriority = "low";
  image.addEventListener("load", () => {
    if (!icon.isConnected) return;
    icon.classList.add("has-image");
    icon.replaceChildren(image);
  }, { once: true });
  image.addEventListener("error", () => {
    icon.classList.remove("has-image");
    icon.replaceChildren(document.createTextNode(fallback));
  }, { once: true });
  image.src = src;
}

function textBlock(title, subtitle) {
  const block = element("span");
  block.append(element("strong", "", title), element("small", "", subtitle));
  return block;
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text) {
    node.textContent = text;
  }

  return node;
}

function setAppClass(className) {
  for (const cleanup of state.renderCleanups.splice(0)) cleanup();
  state.navigationCleanup?.();
  state.navigationCleanup = null;
  app.className = className;
  app.replaceChildren();
}

function getRouteSlug() {
  return decodeURIComponent(window.location.pathname).replace(/^\/+|\/+$/g, "").toLowerCase();
}

function normalizeSlug(value) {
  const cleaned = value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}_/-]/gu, "")
    .toLowerCase();

  if (cleaned === "admin" || cleaned === "api" || cleaned.startsWith("api/")) {
    return `${cleaned}-page`;
  }

  return cleaned || "page";
}

function uniquePageSlug(currentPage, value) {
  const base = normalizeSlug(value);
  const used = new Set(
    state.config.pages
      .filter((page) => page !== currentPage)
      .map((page) => page.slug)
  );
  let slug = base;
  let suffix = 2;

  while (used.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function uniqueClientSlug(base) {
  const used = new Set(state.config.pages.map((page) => page.slug));
  let slug = normalizeSlug(base);
  let suffix = 2;

  while (used.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function cssUrl(value) {
  return value.replace(/"/g, "%22").replace(/\)/g, "%29");
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function applyEntryCardStyle(card, image) {
  if (!image) {
    card.classList.remove("has-entry-background");
    card.style.backgroundImage = "";
    delete card.dataset.entryBackground;
    return;
  }

  card.classList.add("has-entry-background");
  card.dataset.entryBackground = image;
  card.style.backgroundImage = "";

  if (!("IntersectionObserver" in window)) {
    revealEntryCardBackground(card);
    return;
  }

  entryBackgroundObserver.observe(card);
}

const entryBackgroundObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        revealEntryCardBackground(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "120px 0px" })
  : null;

function revealEntryCardBackground(card) {
  const image = card.dataset.entryBackground;
  if (!image) return;
  card.style.backgroundImage = `linear-gradient(90deg, rgba(17, 32, 38, 0.9), rgba(17, 32, 38, 0.3)), url("${cssUrl(image)}")`;
}

function applyPageBackground(node, image) {
  if (!image) {
    node.classList.remove("has-page-background");
    node.style.removeProperty("--page-background-image");
    node.style.backgroundImage = "";
    return;
  }

  node.classList.add("has-page-background");
  node.style.backgroundImage = "";
  node.style.setProperty("--page-background-image", `url("${cssUrl(image)}")`);
}

function resolvePageBackground(page) {
  const prepared = page.dailyBackgroundEnabled
    ? state.preparedPageBackground.get(page.slug)
    : "";
  return prepared || page.backgroundImage || "";
}

function normalizeExternalUrl(value) {
  const raw = (value || "").trim();

  if (!raw) {
    return "";
  }

  if (raw.startsWith("/")) {
    return normalizeInternalPath(raw);
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeInternalPath(value) {
  const path = String(value || "").trim().split(/[?#]/)[0];
  const cleaned = path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => segment.replace(/[^\p{Letter}\p{Number}_-]/gu, ""))
    .filter(Boolean)
    .join("/");
  return cleaned ? `/${cleaned.toLowerCase()}` : "";
}

function normalizeRoomId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "public";
}

function externalLinkSubtitle(link) {
  return hostFromUrl(link.targetUrl) || "外部网站";
}

function hostFromUrl(value) {
  const normalized = normalizeExternalUrl(value);

  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function faviconUrl(value) {
  const normalized = normalizeExternalUrl(value);

  if (!normalized) {
    return "";
  }

  try {
    return `${new URL(normalized).origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "";
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function drawFeatureMap(canvas, pages) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fffefa";
  ctx.fillRect(0, 0, width, height);

  const center = { x: width * 0.5, y: height * 0.5 };
  const radius = Math.min(width, height) * 0.34;

  pages.forEach((page, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(pages.length, 1) - Math.PI / 2;
    const x = center.x + Math.cos(angle) * radius * 2.2;
    const y = center.y + Math.sin(angle) * radius;

    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = "#dff4ee";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#115e59";
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PG", x, y);
  });

  ctx.fillStyle = "#17201d";
  ctx.beginPath();
  ctx.arc(center.x, center.y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("HOME", center.x, center.y);
}

function selectAdminItem(type, id = "") {
  clearAdminGameEditorMode();
  state.selectedItemType = type;
  if (type === "page") state.selectedPageId = id;
  if (type === "link") state.selectedLinkId = id;
  state.adminTab = "content";
  state.expandedSettings = "";
  renderAdminEditor();
}

function renderMobileTopbar(label) {
  const bar = element("header", "mobile-topbar");
  const trigger = withIcon(button("", "icon-button mobile-menu-button", "button"), "menu");
  trigger.setAttribute("aria-label", "打开导航菜单");
  trigger.setAttribute("aria-controls", "site-navigation");
  trigger.setAttribute("aria-expanded", "false");
  const brand = element("a", "mobile-brand", "宽");
  brand.href = "/";
  bar.append(trigger, brand, element("strong", "", label));
  return { bar, trigger };
}

function renderAdminTabs(item) {
  const tabs = element("nav", "admin-editor-tabs");
  tabs.setAttribute("aria-label", "编辑区域");
  const entries = item?.type === "home" ? [["content", "首页内容", "home"], ["security", "安全与权限", "shield"]] : item?.type === "page" ? [["content", item.page.kind === "blog" ? "文章内容" : "内容模块", "file"], ["appearance", "入口与外观", "palette"], ["settings", "页面设置", "settings"]] : [["content", "入口信息", "link"]];
  for (const [value, label, symbol] of entries) {
    const tab = withIcon(button(label, "editor-tab", "button"), symbol);
    tab.classList.toggle("is-active", state.adminTab === value);
    tab.setAttribute("aria-current", state.adminTab === value ? "page" : "false");
    tab.addEventListener("click", () => { state.adminTab = value; renderAdminEditor(); });
    tabs.append(tab);
  }
  return tabs;
}

function openCreateContentDialog() {
  const grid = element("div", "choice-grid");
  const choices = [["page", "file", "普通页面", "用文本、图片和工具模块，搭建自己的页面。"], ["blog", "blog", "博客", "发布文章，整理分类，记录值得分享的事。"], ["link", "link", "网站入口", "把常用网站、服务或游戏，放在首页和导航里。"]];
  const modal = openDialog({ title: "新增内容", description: "选择一个起点，之后可以随时调整。", content: grid });
  for (const [kind, symbol, title, description] of choices) {
    const choice = button("", "choice-card", "button");
    choice.append(icon(symbol), element("strong", "", title), element("span", "", description), icon("arrow", "choice-arrow"));
    choice.addEventListener("click", () => {
      modal.close();
      rememberConfigChange();
      const value = kind === "link" ? createExternalLink() : kind === "blog" ? createBlogPage() : createPage();
      (kind === "link" ? state.config.links : state.config.pages).push(value);
      appendNavOrder(`${kind === "link" ? "link" : "page"}:${value.id}`);
      selectAdminItem(kind === "link" ? "link" : "page", value.id);
      notify(`已创建${title}，编辑完成后记得保存。`);
    });
    grid.append(choice);
  }
}

function sectionHeading(title, description = "") {
  const heading = element("div", "section-head");
  heading.append(element("h2", "", title));
  if (description) heading.append(element("p", "", description));
  return heading;
}

function renderSiteSecurity() {
  const panel = element("section", "admin-panel security-panel");
  panel.append(sectionHeading("管理权限", "管理登录密码与协作权限。"), renderAdminPasswordSettings(), renderCommentBlockWordsSettings());
  return panel;
}

function renderPageSettings(page) {
  const region = element("div", "page-settings-layout");
  const basic = element("section", "admin-panel");
  basic.append(sectionHeading("页面信息", "设置页面标题、网址以及是否公开展示。"), field("页面标题", page.title, value => { page.title = value; }), areaField("页面说明", page.description, value => { page.description = value; }));
  const slug = field("网址后缀", page.slug, value => { page.slug = uniquePageSlug(page, value); }, "网址后缀改变后，原来的地址将无法访问。");
  basic.append(slug, checkbox("在首页和导航中展示", page.visible, checked => { page.visible = checked; renderAdminEditor(); }));
  const permissions = element("section", "admin-panel");
  permissions.append(sectionHeading("访问与编辑权限", "需要私密分享时，可以为这个页面单独设置密码。"));
  if (!isLimitedAdmin()) {
    permissions.append(checkbox("访客进入页面需要密码", page.passwordEnabled, checked => { page.passwordEnabled = checked; renderAdminEditor(); }));
    if (page.passwordEnabled) permissions.append(field("页面访问密码", page.pagePassword, value => { page.pagePassword = value; }, "请使用与管理员不同的密码。", { type: "password", autocomplete: "new-password" }));
    permissions.append(checkbox("限制协作管理员编辑此页面", page.locked, checked => { page.locked = checked; renderAdminEditor(); }));
  }
  const danger = element("section", "admin-panel danger-zone");
  danger.append(sectionHeading("删除页面", "删除后，页面及其模块将从站点移除。"));
  const remove = withIcon(button("删除这个页面", "button danger", "button"), "trash");
  remove.disabled = isLimitedAdmin();
  remove.addEventListener("click", () => deletePage(page));
  danger.append(remove);
  region.append(basic, permissions, renderBottomCommentsSettings(page), danger);
  return region;
}

function openInsertDialog(page, index) {
  const grid = element("div", "choice-grid module-choice-grid");
  const modal = openDialog({ title: "添加内容模块", description: "选择内容类型，在页面里自由组合。", content: grid, className: "module-picker-dialog" });
  for (const { symbol, title, description, create } of getSectionChoices()) {
    const choice = button("", "choice-card", "button");
    choice.append(icon(symbol), element("strong", "", title), element("span", "", description));
    choice.addEventListener("click", () => { modal.close(); insertSection(page, index, create()); });
    grid.append(choice);
  }
}

function renderDestinationCard({ title, description, href, image, marker, kind, meta, locked = false }) {
  const card = element("article", "module-card entry-card destination-card");
  const cover = element("div", "destination-cover");
  if (image) applyEntryCardStyle(cover, image);
  cover.append(element("span", "destination-category", kind));
  const artwork = element("span", "destination-artwork");
  artwork.append(icon(kind === "小游戏" ? "game" : kind === "博客" ? "blog" : kind === "网站" ? "external" : "file"));
  cover.append(artwork);
  if (locked) cover.append(icon("lock", "destination-lock"));
  const body = element("div", "destination-body");
  const header = element("header", "module-card-header no-toggle");
  header.append(marker, textBlock(title, description || ""));
  const footer = element("div", "destination-footer");
  footer.append(element("span", "destination-meta", meta));
  const link = element("a", "button destination-link");
  link.href = href || "#";
  link.setAttribute("aria-label", `打开${title}`);
  link.append(icon(kind === "网站" ? "external" : "arrow"));
  if (!href) {
    link.setAttribute("aria-disabled", "true");
    link.addEventListener("click", event => event.preventDefault());
  }
  footer.append(link);
  body.append(header, footer);
  card.append(cover, body);
  return card;
}

function installAdminShortcuts() {
  if (state.adminShortcutsInstalled) return;
  state.adminShortcutsInstalled = true;
  window.addEventListener("beforeunload", event => {
    if (getRouteSlug() === "admin" && state.dirty) { event.preventDefault(); event.returnValue = ""; }
  });
  document.addEventListener("keydown", event => {
    if (getRouteSlug() !== "admin" || !state.token || !(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "s") { event.preventDefault(); if (state.dirty) saveAdminConfig(); }
    if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (window.matchMedia("(max-width: 860px)").matches && !app.classList.contains("mobile-nav-open")) app.querySelector(".mobile-menu-button")?.click();
      app.querySelector("[data-admin-search]")?.focus();
    }
    const editing = event.target.closest?.("input, textarea, [contenteditable]");
    if (event.key.toLowerCase() === "z" && !editing && !event.shiftKey) { event.preventDefault(); if (!state.savePending) undoAdminChange(); }
  });
  document.addEventListener("click", async event => {
    const link = event.target.closest?.("a[href]");
    if (getRouteSlug() !== "admin" || !state.dirty || !link || link.target === "_blank" || event.ctrlKey || event.metaKey || event.button !== 0) return;
    const destination = new URL(link.href, location.href);
    if (destination.href === location.href) { event.preventDefault(); return; }
    event.preventDefault();
    const leave = await confirmAction({ title: "离开前还有未保存的修改", description: "先保存再离开，可以保留刚才的编辑内容。", confirmLabel: "放弃修改并离开", destructive: true });
    if (leave) { state.dirty = false; location.href = destination.href; }
  });
}

function mountPublicNavigation() {
  if (app.classList.contains("single-module-page")) {
    const back = element("a", "immersive-home-link", "返回首页");
    back.href = "/";
    back.prepend(icon("home"));
    app.append(back);
    return;
  }
  const sidebar = app.querySelector(":scope > .public-sidebar");
  if (!sidebar) return;
  const { bar, trigger } = renderMobileTopbar("宽宽的网站");
  const scrim = button("", "navigation-scrim", "button");
  scrim.setAttribute("aria-label", "关闭导航菜单");
  app.prepend(bar);
  app.append(scrim);
  state.navigationCleanup = bindNavigation(app, sidebar, trigger, scrim);
}
