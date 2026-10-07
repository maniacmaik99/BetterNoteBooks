export type SupportedLanguage =
	| 'auto'
	| 'en'
	| 'zh'
	| 'hi'
	| 'es'
	| 'fr'
	| 'ar'
	| 'bn'
	| 'pt'
	| 'ru'
	| 'ur'
	| 'de'
	| 'ckb'
	| 'kmr'
	| 'sdh';

export interface LanguageInfo {
	code: SupportedLanguage;
	name: string;
	nativeName: string;
	rtl?: boolean;
}

export interface TranslationDict {
	// Ribbon & Commands
	ribbon_open_betternotebooks: string;
	command_open_drawing_view: string;
	command_create_new_notebook: string;
	command_open_notebook_file: string;
	command_add_new_page: string;
	command_toggle_eraser_mode: string;
	command_toggle_stylus_mode: string;
	command_clear_current_page: string;

	// Toolbar Tooltips & Actions
	toolbar_pen: string;
	toolbar_highlighter: string;
	toolbar_eraser: string;
	toolbar_shapes: string;
	toolbar_lasso: string;
	toolbar_colors_back: string;
	toolbar_colors_more: string;
	toolbar_add_color: string;
	toolbar_insert_image_device: string;
	toolbar_insert_image_menu: string;
	toolbar_prev_page: string;
	toolbar_next_page: string;
	toolbar_page_settings: string;
	toolbar_add_page: string;
	toolbar_undo: string;
	toolbar_redo: string;
	toolbar_zoom_out: string;
	toolbar_zoom_in: string;
	toolbar_save_now: string;
	toolbar_toggle_sidebar: string;
	toolbar_shape_banner: string;
	toolbar_lasso_banner: string;
	toolbar_pen_slot: string;
	toolbar_eraser_slot: string;

	// Tool Popovers
	popover_pen_title: string;
	popover_pen_desc: string;
	popover_pen_smoothing: string;
	popover_pen_pressure: string;
	popover_pen_stylus_only: string;
	popover_pen_stylus_only_desc: string;

	popover_eraser_title: string;
	popover_eraser_mode: string;
	popover_eraser_precision: string;
	popover_eraser_stroke: string;
	popover_eraser_size: string;
	popover_clear_page: string;
	popover_clear_page_desc: string;

	popover_shapes_title: string;
	popover_shapes_desc: string;
	popover_shape_recognition: string;
	popover_shape_recognition_desc: string;
	popover_shape_hold_duration: string;
	popover_shape_fill: string;
	popover_shape_fill_desc: string;
	popover_line_style: string;
	popover_line_opacity: string;

	popover_size_adjust_title: string;
	popover_size_slot: string;
	popover_size_fine: string;
	popover_size_medium: string;
	popover_size_broad: string;
	popover_size_marker: string;

	// Lasso Popover & Operations
	lasso_title: string;
	lasso_subtitle: string;
	lasso_include_strokes: string;
	lasso_include_shapes: string;
	lasso_include_images: string;
	lasso_select_all: string;
	lasso_freehand: string;
	lasso_rectangle: string;
	lasso_select_elements: string;
	lasso_filter_handwriting: string;
	lasso_filter_highlighter: string;
	lasso_filter_shapes: string;
	lasso_filter_images: string;
	lasso_all_on: string;
	lasso_filter_active: string;
	lasso_change_color: string;
	lasso_duplicate: string;
	lasso_copy: string;
	lasso_paste: string;
	lasso_delete: string;
	lasso_color_applied: string;
	lasso_copied_notice: string;
	lasso_pasted_notice: string;
	lasso_deleted_notice: string;
	lasso_nothing_selected: string;
	lasso_items_copied: string;
	lasso_elements: string;

	// Sidebar
	sidebar_title: string;
	sidebar_search_placeholder: string;
	sidebar_new_page: string;
	sidebar_all_topics: string;
	sidebar_default_group: string;
	sidebar_add_group: string;
	sidebar_rename_page: string;
	sidebar_assign_topic: string;
	sidebar_change_format_bg: string;
	sidebar_duplicate_page: string;
	sidebar_delete_page: string;
	sidebar_cannot_delete_last: string;
	sidebar_page: string;

	// Page Layout & Formats
	format_a4: string;
	format_a5: string;
	format_a3: string;
	format_letter: string;
	orientation_portrait: string;
	orientation_landscape: string;
	background_ruled: string;
	background_grid: string;
	background_dotted: string;
	background_blank: string;

	// Settings Tab
	settings_language: string;
	settings_language_desc: string;
	settings_language_auto: string;
	settings_smoothing: string;
	settings_smoothing_desc: string;
	settings_pressure: string;
	settings_pressure_desc: string;
	settings_default_format: string;
	settings_default_format_desc: string;
	settings_default_orientation: string;
	settings_default_orientation_desc: string;
	settings_default_background: string;
	settings_default_background_desc: string;
	settings_default_width: string;
	settings_default_width_desc: string;
	settings_default_color: string;
	settings_default_color_desc: string;
	settings_shape_recognition: string;
	settings_shape_recognition_desc: string;
	settings_shape_hold_duration: string;
	settings_shape_hold_duration_desc: string;
	settings_stylus_only: string;
	settings_stylus_only_desc: string;
	settings_zoom_adaptive: string;
	settings_zoom_adaptive_desc: string;
	settings_notebooks_folder: string;
	settings_notebooks_folder_desc: string;

	// General Notices & Status
	notice_saved: string;
	notice_color_added: string;
	notice_color_removed: string;
	notice_page_added: string;
	notice_no_notebooks: string;
	notice_stylus_only_on: string;
	notice_stylus_only_off: string;
}
