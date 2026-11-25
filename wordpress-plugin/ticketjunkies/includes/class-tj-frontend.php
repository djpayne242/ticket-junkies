<?php if (!defined('ABSPATH')) exit;

/**
 * Front end: assets, header/footer, page links and the pages created on activation.
 */

/** URL of one of the plugin's pages: home, event, checkout, tickets, organizer, admin, login, register, ticket */
function tj_page_url($key) {
  $pages = get_option('tj_pages', []);
  if ($key === 'home') {
    $front = (int) get_option('page_on_front');
    if (!empty($pages['home']) && get_post_status($pages['home']) === 'publish' && (int) $pages['home'] !== $front) return get_permalink($pages['home']);
    return home_url('/');
  }
  if (!empty($pages[$key]) && get_post_status($pages[$key]) === 'publish') return get_permalink($pages[$key]);
  return home_url('/');
}

/** Map an app route ('#/event/evt_x', '#/t/ord/key', '#/dashboard' …) to a full URL on the right page */
function tj_route_url($hash) {
  $hash = '#/' . ltrim(preg_replace('~^#?/?~', '', (string) $hash), '/');
  $seg = preg_split('~[/?]~', substr($hash, 2))[0];
  $map = ['' => 'home', 'event' => 'event', 'checkout' => 'checkout', 'order' => 'checkout', 'tickets' => 'tickets', 'dashboard' => 'organizer', 'create' => 'organizer', 'edit' => 'organizer', 'attendees' => 'organizer', 'reports' => 'organizer', 'admin' => 'admin', 'login' => 'login', 'register' => 'register', 't' => 'ticket'];
  $key = isset($map[$seg]) ? $map[$seg] : 'home';
  $base = tj_page_url($key);
  if ($key === 'home') { $q = strpos($hash, '?') !== false ? substr($hash, strpos($hash, '?') + 1) : ''; return $base . ($q ? (strpos($base, '?') !== false ? '&' : '?') . $q : ''); }
  return $base . $hash;
}

final class TJ_Frontend {
  const SCREENS = [
    'event' => 'Event details & tickets', 'checkout' => 'Checkout', 'tickets' => 'My Ticket Dashboard (attendees)',
    'organizer' => 'Organizer Dashboard', 'admin' => 'Admin Panel', 'login' => 'Log in form', 'register' => 'Create account form',
    'ticket' => 'Ticket viewer (links in emails & texts)', 'home' => 'Complete homepage (all-in-one)',
  ];

  public static function ui() {
    return wp_parse_args(get_option('tj_ui', []), ['header' => 1, 'footer' => 1, 'logo' => '', 'footer_text' => '']);
  }

  public static function init() {
    add_action('wp_enqueue_scripts', [__CLASS__, 'assets']);
    add_action('wp_head', [__CLASS__, 'head'], 1);
    add_filter('wp_resource_hints', function ($urls, $rel) { if ($rel === 'preconnect') { $urls[] = 'https://fonts.googleapis.com'; $urls[] = ['href' => 'https://fonts.gstatic.com', 'crossorigin' => 'anonymous']; } return $urls; }, 10, 2);
    add_filter('body_class', function ($c) { $c[] = 'tj-page'; return $c; });
    add_shortcode('ticketjunkies', [__CLASS__, 'shortcode']);
    // Attendees & organizers use the TicketJunkies dashboards, not the WordPress back office
    add_filter('show_admin_bar', function ($show) { return $show && current_user_can('edit_posts'); });
    add_action('admin_init', function () {
      if (wp_doing_ajax() || (defined('DOING_CRON') && DOING_CRON) || current_user_can('edit_posts')) return;
      if (isset($_SERVER['SCRIPT_NAME']) && basename($_SERVER['SCRIPT_NAME']) === 'admin-post.php') return;
      $u = wp_get_current_user();
      if (!$u || !$u->ID) return;
      wp_safe_redirect(in_array('tj_organizer', (array) $u->roles, true) ? tj_route_url('#/dashboard') : tj_route_url('#/tickets'));
      exit;
    });
    $ui = self::ui();
    if ($ui['header'] || $ui['footer']) add_filter('hello_elementor_header_footer', '__return_false');
    if ($ui['header']) add_action('wp_body_open', [__CLASS__, 'header'], 5);
    if ($ui['footer']) add_action('wp_footer', [__CLASS__, 'footer'], 0);
  }

  /** Theme is applied before paint so dark mode never flashes white */
  public static function head() {
    echo "<meta name=\"color-scheme\" content=\"light dark\" />\n";
    echo "<script>(function(){var p='auto';try{p=localStorage.getItem('tj_theme')||'auto'}catch(e){}var d=p==='dark'||(p==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');document.documentElement.setAttribute('data-theme-pref',p);})();</script>\n";
    if (!has_site_icon()) {
      echo '<link rel="icon" href="' . esc_url(TJ_URL . 'assets/img/favicon.png') . "\" />\n";
      echo '<link rel="apple-touch-icon" href="' . esc_url(TJ_URL . 'assets/img/apple-touch-icon.png') . "\" />\n";
    }
    echo "<meta name=\"theme-color\" content=\"#ffffff\" media=\"(prefers-color-scheme: light)\" />\n<meta name=\"theme-color\" content=\"#12161f\" media=\"(prefers-color-scheme: dark)\" />\n";
    // Social media previews, only when no SEO plugin (Yoast, Rank Math, All in One SEO, SEOPress) already adds them
    $seo = defined('WPSEO_VERSION') || defined('RANK_MATH_VERSION') || defined('AIOSEO_VERSION') || defined('SEOPRESS_VERSION');
    if (!$seo && is_singular()) {
      $title = wp_strip_all_tags(get_the_title()) . ' | ' . get_bloginfo('name');
      $desc = get_bloginfo('description') ? get_bloginfo('description') : 'Discover events and buy tickets.';
      $img = has_post_thumbnail() ? get_the_post_thumbnail_url(null, 'large') : TJ_URL . 'assets/img/og/default.png';
      $url = get_permalink();
      printf("<meta property=\"og:type\" content=\"website\" />\n<meta property=\"og:site_name\" content=\"%s\" />\n<meta property=\"og:title\" content=\"%s\" />\n<meta property=\"og:description\" content=\"%s\" />\n<meta property=\"og:url\" content=\"%s\" />\n<meta property=\"og:image\" content=\"%s\" />\n<meta name=\"twitter:card\" content=\"summary_large_image\" />\n<meta name=\"twitter:title\" content=\"%s\" />\n<meta name=\"twitter:description\" content=\"%s\" />\n<meta name=\"twitter:image\" content=\"%s\" />\n",
        esc_attr(get_bloginfo('name')), esc_attr($title), esc_attr($desc), esc_url($url), esc_url($img), esc_attr($title), esc_attr($desc), esc_url($img));
    }
  }

  public static function is_editor() {
    if (!did_action('elementor/loaded')) return false;
    $p = \Elementor\Plugin::$instance;
    return (isset($p->preview) && $p->preview->is_preview_mode()) || (isset($p->editor) && $p->editor->is_edit_mode());
  }

  public static function config() {
    $pages = [];
    foreach (['home', 'event', 'checkout', 'tickets', 'organizer', 'admin', 'login', 'register', 'ticket'] as $k) $pages[$k] = tj_page_url($k);
    $cfg = [
      'rest' => esc_url_raw(rest_url('tj/v1/')), 'nonce' => wp_create_nonce('wp_rest'), 'home' => home_url('/'),
      'assets' => TJ_URL . 'assets/', 'pages' => $pages, 'editor' => self::is_editor(),
      'lostPassword' => wp_lostpassword_url(tj_page_url('login')),
    ];
    if ($cfg['editor']) {
      $r = rest_do_request(new WP_REST_Request('GET', '/tj/v1/events'));
      $d = $r->get_data();
      if (!empty($d['events'][0]['id'])) $cfg['sampleEvent'] = $d['events'][0]['id'];
    }
    return $cfg;
  }

  public static function assets() {
    wp_enqueue_style('tj-fonts', 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap', [], null);
    wp_enqueue_style('tj', TJ_URL . 'assets/tj.css', ['tj-fonts'], TJ_VERSION . '-' . filemtime(TJ_DIR . 'assets/tj.css'));
    // 'defer' lets the page draw before the scripts run (WordPress 6.3+; older versions just load them in the footer)
    wp_enqueue_script('tj-maps', TJ_URL . 'assets/tj-maps.js', [], TJ_VERSION . '-' . filemtime(TJ_DIR . 'assets/tj-maps.js'), ['in_footer' => true, 'strategy' => 'defer']);
    wp_enqueue_script('tj-app', TJ_URL . 'assets/tj-app.js', ['tj-maps'], TJ_VERSION . '-' . filemtime(TJ_DIR . 'assets/tj-app.js'), ['in_footer' => true, 'strategy' => 'defer']);
    wp_add_inline_script('tj-maps', 'window.TJ_CONFIG = ' . wp_json_encode(self::config()) . ';', 'before');
  }

  public static function logo() {
    $ui = self::ui();
    if (!empty($ui['logo'])) return $ui['logo'];
    $id = get_theme_mod('custom_logo');
    if ($id) { $src = wp_get_attachment_image_url($id, 'full'); if ($src) return $src; }
    return TJ_URL . 'assets/img/logo.png';
  }

  public static function header() {
    if (self::is_editor() && !is_singular()) return;
    $logo = esc_url(self::logo());
    $name = esc_attr(get_bloginfo('name'));
    echo '<div class="tj-root tj-site-header"><header class="topbar"><div class="wrap topbar-inner">';
    echo '<a href="' . esc_url(home_url('/')) . '" class="brand"><img src="' . $logo . '" alt="' . $name . '" /></a>';
    echo '<div class="theme-switch" id="themeSwitch" role="group" aria-label="Color theme">'
      . '<button type="button" data-theme-set="light" title="Light (day)" aria-label="Light theme"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>'
      . '<button type="button" data-theme-set="dark" title="Dark (night)" aria-label="Dark theme"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/></svg></button>'
      . '<button type="button" data-theme-set="auto" title="Auto (follow my device)" aria-label="Automatic theme"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg></button>'
      . '</div>';
    echo '<button type="button" class="menu-btn" id="menuBtn" aria-label="Menu">☰</button><nav id="nav" class="nav"></nav>';
    echo '</div></header></div>';
  }

  public static function footer() {
    if (self::is_editor() && !is_singular()) return;
    $ui = self::ui();
    $text = $ui['footer_text'] !== '' ? esc_html($ui['footer_text']) : esc_html(get_bloginfo('name')) . '. All rights reserved.';
    echo '<div class="tj-root tj-site-footer"><footer class="footer"><div class="wrap footer-inner">';
    echo '<img src="' . esc_url(self::logo()) . '" alt="' . esc_attr(get_bloginfo('name')) . '" class="footer-logo" />';
    echo '<div class="footer-links"><a href="' . esc_url(home_url('/')) . '">Browse events</a><a href="' . esc_url(tj_route_url('#/register?role=organizer')) . '">Sell tickets</a><a href="' . esc_url(tj_route_url('#/register')) . '">Create account</a></div>';
    echo '<p class="muted small">© <span id="year">' . esc_html(gmdate('Y')) . '</span> ' . $text . '</p>';
    echo '</div></footer></div>';
  }

  /** Markup for one widget (used by Elementor widgets and the [ticketjunkies] shortcode) */
  public static function widget_html($type, array $opts = []) {
    $note = '';
    if ($type === 'screen' && self::is_editor()) {
      $label = isset(self::SCREENS[$opts['screen'] ?? '']) ? self::SCREENS[$opts['screen']] : 'TicketJunkies screen';
      $note = '<div class="tj-editor-note">🎟️ <strong>TicketJunkies – ' . esc_html($label) . '</strong><br>This area is filled in automatically for each visitor (live preview below). Use the <em>Style</em> tab to change colors, fonts and corners, and add your own Elementor widgets above or below it.</div>';
    }
    return $note . '<div class="tj-root tj-widget" data-tj-widget="' . esc_attr($type) . '" data-tj-opts="' . esc_attr(wp_json_encode($opts)) . '"><div class="loading">Loading…</div></div>';
  }

  /** [ticketjunkies widget="grid" title="Upcoming events"] or [ticketjunkies screen="checkout"] */
  public static function shortcode($atts) {
    $atts = (array) $atts;
    $type = isset($atts['widget']) ? sanitize_key($atts['widget']) : (isset($atts['screen']) ? 'screen' : 'grid');
    unset($atts['widget']);
    foreach ($atts as $k => $v) { if ($v === 'false' || $v === 'no') $atts[$k] = false; elseif ($v === 'true' || $v === 'yes') $atts[$k] = true; }
    return self::widget_html($type, $atts);
  }

  // ------------------------------------------------------------------ pages created on activation
  private static function eid() { return substr(md5(uniqid('', true)), 0, 7); }
  private static function w($type, array $settings = []) { return ['id' => self::eid(), 'elType' => 'widget', 'widgetType' => $type, 'settings' => (object) $settings, 'elements' => []]; }
  private static function c(array $elements, array $settings = [], $inner = false) {
    return ['id' => self::eid(), 'elType' => 'container', 'settings' => (object) $settings, 'elements' => $elements, 'isInner' => $inner];
  }
  private static function px($t, $r = null, $b = null, $l = null) {
    return ['unit' => 'px', 'top' => (string) $t, 'right' => (string) ($r ?? $t), 'bottom' => (string) ($b ?? $t), 'left' => (string) ($l ?? ($r ?? $t)), 'isLinked' => false];
  }

  private static function screen_page($screen) {
    return [self::c([self::w('tj_' . $screen)], ['content_width' => 'boxed', 'padding' => self::px(24, 20, 60, 20)])];
  }

  private static function home_page() {
    $hero_left = self::c([
      self::w('heading', ['title' => 'Get your ticket fix.', 'header_size' => 'h1', 'title_color' => '#FFFFFF', 'typography_typography' => 'custom', 'typography_font_family' => 'Anton', 'typography_font_weight' => '400', 'typography_text_transform' => 'uppercase', 'typography_font_size' => ['unit' => 'px', 'size' => 60], 'typography_font_size_tablet' => ['unit' => 'px', 'size' => 46], 'typography_font_size_mobile' => ['unit' => 'px', 'size' => 38], 'typography_line_height' => ['unit' => 'em', 'size' => 1.05]]),
      self::w('text-editor', ['editor' => '<p>Discover the hottest parties, concerts, comedy shows and festivals — or launch your own event and start selling tickets in minutes.</p>', 'text_color' => '#FFFFFF', 'typography_typography' => 'custom', 'typography_font_size' => ['unit' => 'px', 'size' => 18]]),
      self::w('tj_search', []),
      self::w('tj_cta', ['_element_custom_width' => ['unit' => '%', 'size' => 100]]),
    ], ['content_width' => 'full', 'width' => ['unit' => '%', 'size' => 62], 'width_tablet' => ['unit' => '%', 'size' => 100], 'flex_gap' => ['unit' => 'px', 'size' => 16, 'column' => '16', 'row' => '16'], 'padding' => self::px(0)], true);
    $hero_right = self::c([self::w('tj_weather', [])], ['content_width' => 'full', 'width' => ['unit' => 'px', 'size' => 300], 'width_tablet' => ['unit' => '%', 'size' => 100], 'padding' => self::px(0)], true);
    $hero = self::c([$hero_left, $hero_right], [
      'content_width' => 'full', 'flex_direction' => 'row', 'flex_direction_tablet' => 'column', 'flex_justify_content' => 'space-between', 'flex_align_items' => 'flex-start', 'flex_wrap' => 'nowrap',
      'flex_gap' => ['unit' => 'px', 'size' => 30, 'column' => '30', 'row' => '24'],
      'background_background' => 'gradient', 'background_color' => '#376EB8', 'background_color_b' => '#EB742A', 'background_gradient_angle' => ['unit' => 'deg', 'size' => 135],
      'background_color_stop' => ['unit' => '%', 'size' => 0], 'background_color_b_stop' => ['unit' => '%', 'size' => 100],
      'border_radius' => self::px(22), 'padding' => self::px(56, 48), 'padding_mobile' => self::px(30, 20), 'css_classes' => 'tj-hero-box',
    ], true);
    $promo = self::c([
      self::c([
        self::w('heading', ['title' => 'Throw events? Sell tickets here.', 'header_size' => 'h2', 'typography_typography' => 'custom', 'typography_font_family' => 'Anton', 'typography_font_weight' => '400', 'typography_text_transform' => 'uppercase', 'typography_font_size' => ['unit' => 'px', 'size' => 32]]),
        self::w('text-editor', ['editor' => '<p>Create your event page, set ticket types and prices, track sales and check guests in at the door.</p>']),
      ], ['content_width' => 'full', 'width' => ['unit' => '%', 'size' => 70], 'width_mobile' => ['unit' => '%', 'size' => 100], 'padding' => self::px(0), 'flex_gap' => ['unit' => 'px', 'size' => 4, 'column' => '4', 'row' => '4']], true),
      self::w('button', ['text' => "Start selling — it's free", 'link' => ['url' => tj_route_url('#/register?role=organizer'), 'is_external' => '', 'nofollow' => ''], 'background_color' => '#EB742A', 'border_radius' => self::px(12), 'typography_typography' => 'custom', 'typography_font_weight' => '700']),
    ], ['content_width' => 'full', 'flex_direction' => 'row', 'flex_direction_mobile' => 'column', 'flex_justify_content' => 'space-between', 'flex_align_items' => 'center', 'background_background' => 'classic', 'background_color' => '#FFFFFF', 'border_radius' => self::px(18), 'padding' => self::px(30, 34), 'margin' => self::px(30, 0, 0, 0), 'box_shadow_box_shadow_type' => 'yes', 'box_shadow_box_shadow' => ['horizontal' => 0, 'vertical' => 6, 'blur' => 24, 'spread' => 0, 'color' => 'rgba(20,30,60,0.08)']], true);
    return [self::c([
      $hero,
      self::w('tj_chips', []),
      self::w('tj_map', []),
      self::w('tj_grid', []),
      $promo,
    ], ['content_width' => 'boxed', 'padding' => self::px(28, 20, 60, 20), 'flex_gap' => ['unit' => 'px', 'size' => 26, 'column' => '26', 'row' => '26']])];
  }

  public static function page_defs() {
    return [
      'home' => ['Home', 'home', 'home'], 'event' => ['Event', 'event', 'event'], 'checkout' => ['Checkout', 'checkout', 'checkout'],
      'tickets' => ['My Dashboard', 'my-tickets', 'tickets'], 'organizer' => ['Organizer Dashboard', 'organizer', 'organizer'],
      'admin' => ['Admin Panel', 'ticket-admin', 'admin'], 'login' => ['Log In', 'login', 'login'], 'register' => ['Create Account', 'register', 'register'],
      'ticket' => ['Your Tickets', 'ticket', 'ticket'],
    ];
  }

  /** Creates the pages (built with Elementor when it is active) and Elementor site settings. Safe to run again. */
  public static function install($force = false) {
    $pages = get_option('tj_pages', []);
    $elementor = did_action('elementor/loaded') || defined('ELEMENTOR_VERSION');
    foreach (self::page_defs() as $key => $def) {
      list($title, $slug, $screen) = $def;
      if (!$force && !empty($pages[$key]) && get_post_status($pages[$key]) && get_post_status($pages[$key]) !== 'trash') continue;
      $fallback = $key === 'home'
        ? "[ticketjunkies widget=\"search\"]\n[ticketjunkies widget=\"weather\"]\n[ticketjunkies widget=\"chips\"]\n[ticketjunkies widget=\"map\"]\n[ticketjunkies widget=\"grid\"]"
        : '[ticketjunkies screen="' . $screen . '"]';
      $id = !empty($pages[$key]) && get_post_status($pages[$key]) && get_post_status($pages[$key]) !== 'trash' ? (int) $pages[$key] : 0;
      $post = ['post_title' => $title, 'post_name' => $slug, 'post_type' => 'page', 'post_status' => 'publish', 'post_content' => $fallback, 'comment_status' => 'closed'];
      if ($id) { $post['ID'] = $id; wp_update_post($post); } else { $id = wp_insert_post($post); }
      if (!$id || is_wp_error($id)) continue;
      $pages[$key] = $id;
      update_post_meta($id, '_tj_page', $key);
      if ($elementor) {
        $data = $key === 'home' ? self::home_page() : self::screen_page($screen);
        update_post_meta($id, '_elementor_edit_mode', 'builder');
        update_post_meta($id, '_elementor_template_type', 'wp-page');
        update_post_meta($id, '_elementor_version', defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '3.0.0');
        update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode($data)));
        update_post_meta($id, '_wp_page_template', 'elementor_header_footer');
        delete_post_meta($id, '_elementor_css');
      }
    }
    update_option('tj_pages', $pages);
    if (!empty($pages['home']) && (get_option('show_on_front') !== 'page' || !get_option('page_on_front') || $force)) {
      update_option('show_on_front', 'page');
      update_option('page_on_front', (int) $pages['home']);
    }
    if ($elementor) self::elementor_site_settings();
  }

  /** Wide layout (1600px), brand Global Colors and fonts in Elementor's Site Settings */
  public static function elementor_site_settings() {
    update_option('elementor_disable_color_schemes', 'yes');
    update_option('elementor_disable_typography_schemes', 'yes');
    update_option('elementor_container_width', '1600');
    $kit = (int) get_option('elementor_active_kit');
    if (!$kit) return;
    $s = get_post_meta($kit, '_elementor_page_settings', true);
    if (!is_array($s)) $s = [];
    if (!empty($s['tj_configured'])) return;
    $s['container_width'] = ['unit' => 'px', 'size' => 1600, 'sizes' => []];
    $s['system_colors'] = [
      ['_id' => 'primary', 'title' => 'Primary (blue)', 'color' => '#376EB8'],
      ['_id' => 'secondary', 'title' => 'Secondary (green)', 'color' => '#84D65F'],
      ['_id' => 'text', 'title' => 'Text', 'color' => '#1B1F2A'],
      ['_id' => 'accent', 'title' => 'Accent (orange)', 'color' => '#EB742A'],
    ];
    $s['system_typography'] = [
      ['_id' => 'primary', 'title' => 'Headings', 'typography_typography' => 'custom', 'typography_font_family' => 'Anton', 'typography_font_weight' => '400'],
      ['_id' => 'secondary', 'title' => 'Secondary', 'typography_typography' => 'custom', 'typography_font_family' => 'Inter', 'typography_font_weight' => '600'],
      ['_id' => 'text', 'title' => 'Text', 'typography_typography' => 'custom', 'typography_font_family' => 'Inter', 'typography_font_weight' => '400'],
      ['_id' => 'accent', 'title' => 'Accent', 'typography_typography' => 'custom', 'typography_font_family' => 'Inter', 'typography_font_weight' => '700'],
    ];
    $s['tj_configured'] = 1;
    update_post_meta($kit, '_elementor_page_settings', $s);
    if (class_exists('\Elementor\Plugin') && isset(\Elementor\Plugin::$instance->files_manager)) \Elementor\Plugin::$instance->files_manager->clear_cache();
  }
}
