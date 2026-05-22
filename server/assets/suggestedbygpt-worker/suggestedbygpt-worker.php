<?php
/**
 * Plugin Name: SuggestedByGPT Worker
 * Plugin URI: https://suggestedbygpt.com
 * Description: Connects your website to SuggestedByGPT so we can optimize your AI visibility automatically.
 * Version: 1.1.0
 * Author: SuggestedByGPT
 *
 * 1.1.0 (2026-05-12): Added /publish-post endpoint for Dominator Blog Content
 *   Delivery (post_type=post with Yoast/RankMath/AIOSEO meta + per-post JSON-LD).
 * Author URI: https://suggestedbygpt.com
 * License: GPL v2 or later
 */

if (!defined('ABSPATH')) exit;

// Server URL — filterable for staging/development
if (!defined('SBGPT_SERVER_URL')) {
    define('SBGPT_SERVER_URL', 'https://suggestedbygpt.com');
}

// ── Activation: Generate API key + phone home ────────────────────────────
register_activation_hook(__FILE__, function () {
    if (!get_option('sbgpt_api_key')) {
        update_option('sbgpt_api_key', wp_generate_password(64, false, false));
    }
    update_option('sbgpt_installed_at', current_time('mysql'));
    update_option('sbgpt_plugin_version', '1.1.0');

    // Phone home: register this site with SuggestedByGPT
    $api_key = get_option('sbgpt_api_key');
    wp_remote_post(SBGPT_SERVER_URL . '/api/plugin/register', array(
        'body'    => wp_json_encode(array(
            'site_url' => get_site_url(),
            'api_key'  => $api_key,
        )),
        'headers' => array('Content-Type' => 'application/json'),
        'timeout' => 15,
    ));
});

// ── Deactivation: Notify server + clean up ───────────────────────────────
register_deactivation_hook(__FILE__, function () {
    // Notify server that plugin is being deactivated so it stops using this API key
    $api_key = get_option('sbgpt_api_key');
    if ($api_key) {
        wp_remote_post(SBGPT_SERVER_URL . '/api/plugin/deactivate', array(
            'body'    => wp_json_encode(array(
                'site_url' => get_site_url(),
                'api_key'  => $api_key,
            )),
            'headers' => array('Content-Type' => 'application/json'),
            'timeout' => 10,
        ));
    }

    delete_option('sbgpt_api_key');
    delete_option('sbgpt_installed_at');
    delete_option('sbgpt_plugin_version');
    delete_option('sbgpt_snippets');
});

// ── HMAC Authentication ───────────────────────────────────────────────────
function sbgpt_verify_request($request) {
    $api_key = get_option('sbgpt_api_key');
    if (!$api_key) return new WP_Error('no_key', 'Plugin not configured', array('status' => 500));

    $timestamp = $request->get_header('X-SBGPT-Timestamp');
    $signature = $request->get_header('X-SBGPT-Signature');

    if (!$timestamp || !$signature) {
        return new WP_Error('missing_auth', 'Missing authentication headers', array('status' => 401));
    }

    // Reject if timestamp is more than 5 minutes old (replay protection)
    if (abs(time() - intval($timestamp)) > 300) {
        return new WP_Error('expired', 'Request timestamp expired', array('status' => 401));
    }

    // Verify HMAC signature
    $route = $request->get_route();
    $body = $request->get_body();
    $expected = hash_hmac('sha256', $timestamp . $route . $body, $api_key);

    if (!hash_equals($expected, $signature)) {
        return new WP_Error('invalid_sig', 'Invalid signature', array('status' => 403));
    }

    return true;
}

// ── Register REST API Endpoints ───────────────────────────────────────────
add_action('rest_api_init', function () {

    // Health check / status (public — limited info)
    register_rest_route('sbgpt/v1', '/status', array(
        'methods'  => 'GET',
        'callback' => function ($request) {
            // Public response: minimal info only (no server fingerprinting)
            $data = array(
                'plugin_version' => get_option('sbgpt_plugin_version', '1.1.0'),
                'site_url'       => get_site_url(),
                'status'         => 'active',
            );

            // Authenticated requests get extended info
            $auth_result = sbgpt_verify_request($request);
            if ($auth_result === true) {
                $data['wp_version']   = get_bloginfo('version');
                $data['active_theme'] = get_template();
                $data['php_version']  = phpversion();
                $data['installed_at'] = get_option('sbgpt_installed_at');
            }

            // Admin cookie session can retrieve the API key (for initial setup)
            if ($request->get_header('X-SBGPT-Setup') === 'true' && current_user_can('manage_options')) {
                $data['api_key'] = get_option('sbgpt_api_key');
            }

            return rest_ensure_response($data);
        },
        'permission_callback' => '__return_true',
    ));

    // Create or update a page
    register_rest_route('sbgpt/v1', '/create-page', array(
        'methods'  => 'POST',
        'callback' => function ($request) {
            $auth = sbgpt_verify_request($request);
            if (is_wp_error($auth)) return $auth;

            $params = $request->get_json_params();
            $title   = sanitize_text_field($params['title'] ?? '');
            $content = $params['content'] ?? '';
            $slug    = sanitize_title($params['slug'] ?? $title);
            $status  = sanitize_text_field($params['status'] ?? 'publish');
            $find_existing = !empty($params['find_existing']);

            if (!$title || !$content) {
                return new WP_Error('missing_params', 'title and content required', array('status' => 400));
            }

            // Check for existing page by slug
            if ($find_existing) {
                $existing = get_page_by_path($slug);
                if ($existing) {
                    wp_update_post(array(
                        'ID'           => $existing->ID,
                        'post_content' => $content,
                        'post_status'  => $status,
                    ));
                    return rest_ensure_response(array(
                        'success' => true,
                        'action'  => 'updated',
                        'page_id' => $existing->ID,
                        'url'     => get_permalink($existing->ID),
                    ));
                }
            }

            // Create new page
            $page_id = wp_insert_post(array(
                'post_title'   => $title,
                'post_content' => $content,
                'post_name'    => $slug,
                'post_status'  => $status,
                'post_type'    => 'page',
            ));

            if (is_wp_error($page_id)) {
                return $page_id;
            }

            return rest_ensure_response(array(
                'success' => true,
                'action'  => 'created',
                'page_id' => $page_id,
                'url'     => get_permalink($page_id),
            ));
        },
        'permission_callback' => '__return_true', // Auth handled by HMAC
    ));

    // Publish a blog post (post_type=post). Used by the Dominator Blog Content
    // Delivery program. Mirrors /create-page but with post_type=post and
    // first-class support for excerpt, featured_image_url, schema_json_ld,
    // and per-post meta (title/description).
    register_rest_route('sbgpt/v1', '/publish-post', array(
        'methods'  => 'POST',
        'callback' => function ($request) {
            $auth = sbgpt_verify_request($request);
            if (is_wp_error($auth)) return $auth;

            $params = $request->get_json_params();
            $title         = sanitize_text_field($params['title'] ?? '');
            $content       = $params['content'] ?? '';
            $slug          = sanitize_title($params['slug'] ?? $title);
            $status        = sanitize_text_field($params['status'] ?? 'publish');
            $excerpt       = sanitize_text_field($params['excerpt'] ?? '');
            $meta_title    = sanitize_text_field($params['meta_title'] ?? '');
            $meta_desc     = sanitize_text_field($params['meta_description'] ?? '');
            $featured_url  = esc_url_raw($params['featured_image_url'] ?? '');
            $featured_alt  = sanitize_text_field($params['featured_image_alt'] ?? '');
            $schema_jsonld = $params['schema_json_ld'] ?? '';
            $find_existing = !empty($params['find_existing']);

            if (!$title || !$content) {
                return new WP_Error('missing_params', 'title and content required', array('status' => 400));
            }

            // Find existing post by slug
            $existing_id = 0;
            if ($find_existing) {
                $existing = get_page_by_path($slug, OBJECT, 'post');
                if ($existing) $existing_id = $existing->ID;
            }

            if ($existing_id) {
                wp_update_post(array(
                    'ID'           => $existing_id,
                    'post_title'   => $title,
                    'post_content' => $content,
                    'post_excerpt' => $excerpt,
                    'post_status'  => $status,
                ));
                $post_id = $existing_id;
                $action  = 'updated';
            } else {
                $post_id = wp_insert_post(array(
                    'post_title'   => $title,
                    'post_content' => $content,
                    'post_excerpt' => $excerpt,
                    'post_name'    => $slug,
                    'post_status'  => $status,
                    'post_type'    => 'post',
                ));
                if (is_wp_error($post_id)) return $post_id;
                $action = 'created';
            }

            // Featured image: sideload from URL if provided
            if ($featured_url) {
                require_once(ABSPATH . 'wp-admin/includes/media.php');
                require_once(ABSPATH . 'wp-admin/includes/file.php');
                require_once(ABSPATH . 'wp-admin/includes/image.php');
                $attach_id = media_sideload_image($featured_url, $post_id, $featured_alt, 'id');
                if (!is_wp_error($attach_id)) {
                    set_post_thumbnail($post_id, $attach_id);
                }
            }

            // Per-post meta (Yoast/RankMath/AIOSEO compatibility — write standard keys
            // plus the popular plugin-specific keys so whichever plugin is active uses them)
            if ($meta_title) {
                update_post_meta($post_id, '_yoast_wpseo_title', $meta_title);
                update_post_meta($post_id, 'rank_math_title', $meta_title);
                update_post_meta($post_id, '_aioseo_title', $meta_title);
            }
            if ($meta_desc) {
                update_post_meta($post_id, '_yoast_wpseo_metadesc', $meta_desc);
                update_post_meta($post_id, 'rank_math_description', $meta_desc);
                update_post_meta($post_id, '_aioseo_description', $meta_desc);
            }

            // Per-post schema JSON-LD. We store it as a meta and inject it via
            // wp_head only for THIS post. Conflict-avoidance is handled
            // server-side (we skip Article schema when Yoast/RankMath detected).
            if ($schema_jsonld) {
                update_post_meta($post_id, 'sbgpt_schema_json_ld', $schema_jsonld);
            }

            return rest_ensure_response(array(
                'success' => true,
                'action'  => $action,
                'post_id' => $post_id,
                'url'     => get_permalink($post_id),
            ));
        },
        'permission_callback' => '__return_true', // Auth handled by HMAC
    ));

    // Inject code snippet into wp_head or wp_footer
    register_rest_route('sbgpt/v1', '/inject-snippet', array(
        'methods'  => 'POST',
        'callback' => function ($request) {
            $auth = sbgpt_verify_request($request);
            if (is_wp_error($auth)) return $auth;

            $params     = $request->get_json_params();
            $code       = $params['code'] ?? '';
            $location   = sanitize_text_field($params['location'] ?? 'head');
            $identifier = sanitize_text_field($params['identifier'] ?? 'default');

            if (!$code) {
                return new WP_Error('missing_params', 'code is required', array('status' => 400));
            }

            if (!in_array($location, array('head', 'footer'), true)) {
                return new WP_Error('invalid_location', 'location must be head or footer', array('status' => 400));
            }

            $snippets = get_option('sbgpt_snippets', array());
            $snippets[$identifier] = array(
                'code'       => $code,
                'location'   => $location,
                'updated_at' => current_time('mysql'),
            );
            update_option('sbgpt_snippets', $snippets);

            return rest_ensure_response(array(
                'success'    => true,
                'identifier' => $identifier,
                'location'   => $location,
            ));
        },
        'permission_callback' => '__return_true',
    ));

    // AI Crawler Audit — detect security plugins and settings blocking AI crawlers
    register_rest_route('sbgpt/v1', '/ai-crawler-audit', array(
        'methods'  => 'GET',
        'callback' => function ($request) {
            $auth = sbgpt_verify_request($request);
            if (is_wp_error($auth)) return $auth;

            $audit = array(
                'blog_public'         => get_option('blog_public', '1'),
                'robots_txt_exists'   => file_exists(ABSPATH . 'robots.txt'),
                'active_plugins'      => array(),
                'security_plugins'    => array(),
                'ai_crawler_blocks'   => array(),
            );

            // Get active plugins (just slugs, not full paths)
            $active = get_option('active_plugins', array());
            foreach ($active as $plugin) {
                $dir = dirname($plugin);
                $audit['active_plugins'][] = ($dir === '.' ? basename($plugin, '.php') : $dir);
            }

            // Detect known security plugins
            $security_map = array(
                'wordfence'             => 'Wordfence Security',
                'sucuri-scanner'        => 'Sucuri Security',
                'all-in-one-wp-security-and-firewall' => 'All In One WP Security',
                'better-wp-security'    => 'Solid Security (iThemes)',
                'ithemes-security-pro'  => 'Solid Security Pro',
            );
            foreach ($security_map as $slug => $name) {
                foreach ($active as $plugin) {
                    if (strpos($plugin, $slug) !== false) {
                        if (!in_array($name, $audit['security_plugins'], true)) {
                            $audit['security_plugins'][] = $name;
                        }
                        break; // Found this plugin, move to next in security_map
                    }
                }
            }

            // Check Rank Math robots.txt content
            $rm_robots = get_option('rank_math_robots_txt_content');
            if ($rm_robots) {
                $audit['rank_math_robots'] = $rm_robots;
                // Parse robots.txt block-by-block to check if AI crawlers are specifically disallowed
                $ai_bots = array('GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'PerplexityBot', 'anthropic-ai', 'ChatGPT-User', 'Bytespider');
                $blocks = preg_split('/(?=User-agent:)/i', $rm_robots);
                foreach ($blocks as $block) {
                    $block_lower = strtolower(trim($block));
                    if (empty($block_lower)) continue;
                    // Check if this block has a Disallow directive (not just comments)
                    if (stripos($block, 'Disallow:') === false) continue;
                    foreach ($ai_bots as $bot) {
                        // Check if this user-agent block targets this bot or wildcard (*)
                        if (preg_match('/User-agent:\s*(' . preg_quote($bot, '/') . '|\*)/i', $block)) {
                            // Verify the Disallow is meaningful (not just "Disallow: " which means allow all)
                            if (preg_match('/Disallow:\s*\S/i', $block)) {
                                $audit['ai_crawler_blocks'][] = 'rank_math:' . $bot;
                            }
                        }
                    }
                }
            }

            // Check AIOS blacklisted user agents
            $aios_config = get_option('aio_wp_security_configs');
            if ($aios_config) {
                $aios = maybe_unserialize($aios_config);
                if (is_array($aios)) {
                    $blacklisting = isset($aios['aiowps_enable_blacklisting']) ? $aios['aiowps_enable_blacklisting'] : '0';
                    $banned_agents = isset($aios['aiowps_banned_user_agents']) ? $aios['aiowps_banned_user_agents'] : '';
                    $audit['aios_blacklisting_enabled'] = $blacklisting;
                    if ($blacklisting === '1' && !empty($banned_agents)) {
                        $audit['aios_banned_agents'] = $banned_agents;
                        $ai_bots = array('GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'PerplexityBot', 'anthropic', 'ChatGPT', 'Bytespider');
                        foreach ($ai_bots as $bot) {
                            if (stripos($banned_agents, $bot) !== false) {
                                $audit['ai_crawler_blocks'][] = 'aios:' . $bot;
                            }
                        }
                    }
                }
            }

            // Check Wordfence rate limiting
            $wf_options = get_option('wordfence_options');
            if ($wf_options) {
                $wf = maybe_unserialize($wf_options);
                if (is_array($wf)) {
                    $audit['wordfence_settings'] = array(
                        'maxRequestsCrawlers' => isset($wf['maxRequestsCrawlers']) ? $wf['maxRequestsCrawlers'] : null,
                        'maxRequestsUnknown'  => isset($wf['maxRequestsUnknown']) ? $wf['maxRequestsUnknown'] : null,
                        'neverBlockBG'        => isset($wf['neverBlockBG']) ? $wf['neverBlockBG'] : null,
                    );
                    // Flag if rate limiting is aggressive (< 120 requests/min for crawlers)
                    $max = isset($wf['maxRequestsCrawlers']) ? intval($wf['maxRequestsCrawlers']) : 999;
                    if ($max > 0 && $max < 120) {
                        $audit['ai_crawler_blocks'][] = 'wordfence:rate_limiting';
                    }
                }
            }

            // Check Wordfence custom user-agent blocks (stored in custom table)
            global $wpdb;
            $wf_blocks_table = $wpdb->prefix . 'wfBlocks7';
            if ($wpdb->get_var("SHOW TABLES LIKE '$wf_blocks_table'") === $wf_blocks_table) {
                $agent_blocks = $wpdb->get_results(
                    "SELECT id, blockString FROM $wf_blocks_table WHERE blockType = 'UA' LIMIT 50"
                );
                if ($agent_blocks) {
                    $ai_bots = array('GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'PerplexityBot', 'anthropic', 'ChatGPT', 'Bytespider');
                    foreach ($agent_blocks as $block) {
                        foreach ($ai_bots as $bot) {
                            if (stripos($block->blockString, $bot) !== false) {
                                $audit['ai_crawler_blocks'][] = 'wordfence_block:' . $bot;
                            }
                        }
                    }
                }
            }

            return rest_ensure_response($audit);
        },
        'permission_callback' => '__return_true', // Auth handled by HMAC
    ));

    // Edit a file (allowlisted paths only)
    register_rest_route('sbgpt/v1', '/edit-file', array(
        'methods'  => 'POST',
        'callback' => function ($request) {
            $auth = sbgpt_verify_request($request);
            if (is_wp_error($auth)) return $auth;

            $params  = $request->get_json_params();
            $path    = $params['path'] ?? '';
            $content = $params['content'] ?? '';

            // Security: only allow specific files
            $allowed_files = array('robots.txt', 'llms.txt', 'llms-full.txt', 'ads.txt');
            if (!in_array($path, $allowed_files, true)) {
                return new WP_Error('forbidden_path', 'File path not allowed: ' . $path, array('status' => 403));
            }

            if (!$content) {
                return new WP_Error('missing_params', 'content is required', array('status' => 400));
            }

            $full_path = ABSPATH . $path;
            $written = file_put_contents($full_path, $content);

            if ($written === false) {
                return new WP_Error('write_failed', 'Could not write to ' . $path, array('status' => 500));
            }

            return rest_ensure_response(array(
                'success' => true,
                'path'    => $path,
                'bytes'   => $written,
                'url'     => get_site_url() . '/' . $path,
            ));
        },
        'permission_callback' => '__return_true',
    ));
});

// ── Serve llms.txt / llms-full.txt as plain text (invisible to visitors) ──
// Intercepts early so these files never appear as WordPress pages or menu items.
// Files are written to ABSPATH by the /edit-file endpoint above.
add_action('template_redirect', function () {
    $path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    if ($path === 'llms.txt' || $path === 'llms-full.txt') {
        $file = ABSPATH . $path;
        if (file_exists($file)) {
            header('Content-Type: text/plain; charset=utf-8');
            header('X-Robots-Tag: noindex');
            readfile($file);
            exit;
        }
    }
}, 1); // Priority 1 = very early, before theme routing

// ── Output stored snippets in wp_head / wp_footer ─────────────────────────
add_action('wp_head', function () {
    $snippets = get_option('sbgpt_snippets', array());
    foreach ($snippets as $id => $snippet) {
        if (($snippet['location'] ?? '') === 'head') {
            echo "\n<!-- SuggestedByGPT: " . esc_attr($id) . " -->\n";
            echo $snippet['code'];
            echo "\n";
        }
    }

    // Per-post Article/FAQPage JSON-LD (set by /publish-post)
    if (is_singular('post')) {
        $post_id = get_the_ID();
        $schema = get_post_meta($post_id, 'sbgpt_schema_json_ld', true);
        if ($schema) {
            echo "\n<!-- SuggestedByGPT: per-post schema -->\n";
            echo '<script type="application/ld+json">' . "\n";
            echo $schema . "\n";
            echo '</script>' . "\n";
        }
    }
}, 1);

add_action('wp_footer', function () {
    $snippets = get_option('sbgpt_snippets', array());
    foreach ($snippets as $id => $snippet) {
        if (($snippet['location'] ?? '') === 'footer') {
            echo "\n<!-- SuggestedByGPT: " . esc_attr($id) . " -->\n";
            echo $snippet['code'];
            echo "\n";
        }
    }
}, 99);
