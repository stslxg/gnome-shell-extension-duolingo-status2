const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const Animation = imports.ui.animation;
const Tweener = imports.tweener.tweener;
const Me = ExtensionUtils.getCurrentExtension();
const CustomSignals = Me.imports.custom_signals.CustomSignals;
const Duolingo = Me.imports.duolingo.Duolingo;
const Reminder = Me.imports.reminder.Reminder;
const Utils = Me.imports.utils;
const Constants = Me.imports.constants;
const LanguageSubMenu = Me.imports.duolingoLanguageMenu.LanguageSubMenu;

const Util = imports.misc.util;
const schema = Me.metadata['settings-schema'];
const Settings = ExtensionUtils.getSettings(schema);
const GObject = imports.gi.GObject;
const Gettext = imports.gettext;
const _ = Gettext.domain(Me.uuid).gettext;

var icon_size = 16;
var menu_width = 250;

var DuolingoMenuButton = GObject.registerClass(class DuolingoMenuButton extends PanelMenu.Button {

	_init() {
		super._init(0.0, 'duolingo');
	    Gettext.bindtextdomain(Me.uuid, Me.dir.get_child('locale').get_path());

		this.custom_signals = new CustomSignals();
        this.add_style_class_name('panel-status-button');
		var spinnerIcon = Gio.File.new_for_uri('resource:///org/gnome/shell/theme/process-working.svg');
		this.spinner = new Animation.AnimatedIcon(spinnerIcon, 16);
		this.spinner.show();
		this.add_child(this.spinner);
		this._set_spinner(true);

        this.reminder = null;
		this.duolingo = new Duolingo(
			Settings.get_string(Constants.SETTING_USERNAME),
			Settings.get_string(Constants.SETTING_PASSWORD));
		this.duolingo.get_raw_data(Lang.bind(this, this._create_menus));

        this._settings_changed = false;
        Settings.connect('changed', Lang.bind(this, function() {
			if (this._settings_changed !== true)
				this._settings_changed = true;
		}));
		this._finalize_menu_icon();
	}

	_create_menus(error) {
		if (Settings.get_boolean(Constants.SETTING_HIDE_WHEN_DAILY_GOAL_REACHED) && this.duolingo.is_daily_goal_reached()) {
			this.destroy();
			return;
		}

		if(error) {
			Main.notify(Constants.LABEL_NOTIFICATION_TITLE, error);
			this._init_icon(Constants.ICON_DUOLINGO_ALERT);
			this._init_duolingo_menu();
		} else {
    		this._init_icon(Constants.ICON_DUOLINGO);
    		this._init_duolingo_menu();

    		/* display profile menu */
    		this.todays_improvement = new St.Label({
				y_align: Clutter.ActorAlign.CENTER
			});
    		this.profile_menu = new PopupMenu.PopupBaseMenuItem();

    		this.profile_menu.add(this.todays_improvement);

    		var streak_label = new St.Label({
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
				x_expand: true
			});
    		if (this.duolingo.get_streak() != 0) {
    			streak_label.text =  this.duolingo.get_streak().toString();
                if (this.duolingo.is_frozen()) {
                    streak_label.style_class = Constants.STYLE_STREAK_FROZEN;
                } else {
                    streak_label.style_class = Constants.STYLE_STREAK_NOT_FROZEN;
                }

    		} else {
    			streak_label.text = '';
    		}
    		this.profile_menu.add(streak_label);

    		this.menu.addMenuItem(this.profile_menu);
    		this._set_todays_improvement();
    		this._display_lingots();
            this._display_double_or_nothing();

    		/* display language menus */
    		this._add_language_menus();

            // initiate reminder
			this._initiate_reminder();
		}
	}

	_init_icon(path) {
		// remove spinner
		this._set_spinner(false);
		this.remove_child(this.spinner);

		this.hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
		var gicon = Gio.icon_new_for_string(path);
		var icon = new St.Icon({gicon: gicon, icon_size: icon_size});
        this.hbox.add_child(icon);
        this.add_style_class_name('panel-status-button');
		this.add_child(this.hbox);
	}

	_init_duolingo_menu() {
		/* Duolingo menu */
		var link_menu = new PopupMenu.PopupBaseMenuItem();
		link_menu.width = menu_width;
		var link_label = new St.Label({ text: 'Duolingo.com', x_expand: true, x_align: Clutter.ActorAlign.CENTER });
        link_label.add_style_class_name(Constants.STYLE_DUOLINGO_LINK);
		link_menu.add(link_label);
		link_menu.connect('activate', function() {
			Util.spawn([Settings.get_string(Constants.SETTING_OPENING_BROWSER_COMMAND), Constants.URL_DUOLINGO_HOME]);
		});

		/* refresh button */
		var refresh_icon = new St.Icon({
			icon_name: 'view-refresh-symbolic',
			style_class: 'system-actions-icon',
			icon_size: icon_size
		});
		var refresh_button = new St.Button({child: refresh_icon, x_expand: false});
		refresh_button.connect('clicked', Lang.bind(this, function() {
			this.menu.close(); // this closing action is necessary, otherwise GJS fails.
			this.custom_signals.emit(Constants.EVENT_REFRESH);
		}));
		link_menu.add(refresh_button);

		/* Preferences button */
		var preferences_icon = new St.Icon({
			icon_name: 'system-run-symbolic',
			style_class: 'system-actions-icon',
			icon_size: icon_size
		});
		var preferences_button = new St.Button({child: preferences_icon, x_expand: false});
		preferences_button.connect('clicked', Lang.bind(this, function() {
            this.custom_signals.emit(Constants.EVENT_PREFERENCES);
		}));
		link_menu.add(preferences_button);

		this.menu.addMenuItem(link_menu);
	}

    _initiate_reminder() {
        this.reminder = new Reminder(this.duolingo);
        if (!this.duolingo.is_daily_goal_reached()) {
            this.reminder.start();
        }
	}

    stop_reminder() {
        if (this.reminder != null)
            this.reminder.stop();
    }

	_add_language_menus() {
        var languages = this.duolingo.get_languages();
		for (var l in languages) {
			var m = new LanguageSubMenu(languages[l], this.duolingo);
			this.menu.addMenuItem(m);
			m.custom_signals.connect(Constants.EVENT_REFRESH, Lang.bind(this, function () {
				// TODO maybe add the spinner when switching language
				this.custom_signals.emit(Constants.EVENT_REFRESH);
				Main.notify(_('Duolingo extension restarted: language switched.'));
			}));
		}
	}

	_display_lingots() {
        if(this.duolingo.get_double_or_nothing_status() == null || Settings.get_boolean(Constants.SETTING_SHOW_LINGOTS)) {
            var lingots = this.duolingo.get_lingots();
        	var gicon = Gio.icon_new_for_string(Constants.ICON_LINGOTS);
        	var lingots_icon = new St.Icon({
                gicon: gicon,
                icon_size: icon_size,
                y_align: Clutter.ActorAlign.CENTER});
        	var lingots_label = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
                text: Utils.formatThousandNumber(lingots.toString())});
            lingots_label.add_style_class_name(Constants.STYLE_LINGOTS_LABEL);
        	this.profile_menu.connect('activate', this._open_lingots_link);
            this.profile_menu.add(lingots_icon);
        	this.profile_menu.add(lingots_label);
        }
	}

    _display_double_or_nothing() {
        var double_or_nothing = this.duolingo.get_double_or_nothing_status();
        if (double_or_nothing != null) {
            var gicon = Gio.icon_new_for_string(Constants.ICON_FIRE);
        	var fire_icon = new St.Icon({
                gicon: gicon,
                icon_size: icon_size,
                y_align: Clutter.ActorAlign.CENTER});
    		var double_or_nothing_label = new St.Label({
                y_align:Clutter.ActorAlign.CENTER,
                text: double_or_nothing + Constants.LABEL_XP_SEPARATOR + '7'});
            double_or_nothing_label.add_style_class_name(Constants.STYLE_DOUBLE_OR_NOTHING_LABEL);
        	this.profile_menu.connect('activate', this._open_lingots_link);
    		this.profile_menu.add(fire_icon);
    		this.profile_menu.add(double_or_nothing_label);
        }
	}

	_open_lingots_link() {
        Util.spawn([Settings.get_string(Constants.SETTING_OPENING_BROWSER_COMMAND), Constants.URL_DUOLINGO_STORE]);
	}

	_set_todays_improvement() {
		var improvement = this.duolingo.get_improvement();
		var daily_goal = this.duolingo.get_daily_goal();
		this.todays_improvement.text = improvement + Constants.LABEL_XP_SEPARATOR + daily_goal + ' XP';

		if (!this.duolingo.is_daily_goal_reached()) {
			this.hbox.get_child_at_index(0).style = 'color: ' + Settings.get_string(Constants.SETTING_ICON_COLOR_WHEN_DAILY_GOAL_NOT_REACHED) +';'
		} else {
			if(Settings.get_boolean(Constants.SETTING_CHANGE_ICON_COLOR_WHEN_DAILY_GOAL_REACHED)) {
				this.hbox.get_child_at_index(0).style = 'color: ' + Settings.get_string(Constants.SETTING_ICON_COLOR_WHEN_DAILY_GOAL_REACHED) +';'
			}
		}
	}

    _finalize_menu_icon() {
        // for the top right corner, use Main.panel.addToStatusArea() with an index as a 3rd parameter.
        // let index = 0; // 0, 1: normal in the queue, 2: just at the left of the main menu, -1: completely in the top right corner
        // let position = 'right';
        var index = parseInt(Settings.get_string(Constants.SETTING_ICON_INDEX));
        var position = Settings.get_string(Constants.SETTING_ICON_POSITION);
        Main.panel.addToStatusArea('duolingo', this, index, position);
	}
	
	_set_spinner(enable) {
		Tweener.removeTweens(this.spinner);

		if(enable) {
			this.spinner.play();
			Tweener.addTween(this.spinner, {
				opacity: 255,
				transition: 'linear'
			});
		} else {
			Tweener.addTween(this.spinner, {
				opacity: 0,
                transition: 'linear',
                onCompleteScope: this,
                onComplete: function() {
					if (this.spinner)
						this.spinner.stop();
				}
			});
		}
	}

    have_settings_been_changed() {
        return this._settings_changed;
    }

	// _add_purchase_menu() {
	// 	if (Settings.get_boolean(Constants.SETTING_USE_AUTHENTICATION)) {

	// 		/* Duolingo menu */
	// 		// let purchase_menu = new PopupMenu.PopupBaseMenuItem();
	// 		// purchase_menu.actor.width = menu_width;

	// 		var buy_streak_button = new St.Button({
    //         	style_class: 'system-menu-action',
	// 			x_fill: false,
    //         	can_focus: true
    //     	});

	// 		// Set the Icon of the Button
	// 		var gicon = Gio.icon_new_for_string(Constants.ICON_ICE_CUBE);
    //     	var buy_streak_icon = new St.Icon({
	// 			gicon: gicon, 
	// 			icon_size: icon_size
	// 		});
	// 		buy_streak_button.set_child(buy_streak_icon);
	// 		// this.menu.box.add_child(buy_streak_button);

	// 		var buy_fire_button = new St.Button({
    //         	style_class: 'system-menu-action',
	// 			x_fill: false,
    //         	can_focus: true
    //     	});
	// 		gicon = Gio.icon_new_for_string(Constants.ICON_FIRE);
    //     	var buy_fire_icon = new St.Icon({
	// 			gicon: gicon, 
	// 			icon_size: icon_size
	// 		});
	// 		buy_fire_button.set_child(buy_fire_icon);

	// 		var buttons_box = new St.BoxLayout({
	// 			style_class: 'buttons-box'
	// 		});

	// 		buttons_box.add(buy_streak_button);
	// 		buttons_box.add(buy_fire_button);

	// 		this.menu.box.add_child(buttons_box);

	// 		buy_streak_button.connect('clicked', Lang.bind(this, function() {
	// 			this.duolingo.buy_item(
	// 				'streak_freeze', 
	// 				// 'rupee_wager',
	// 				Lang.bind(this, function() {
	// 					this.custom_signals.emit(Constants.EVENT_REFRESH);
	// 				}),
	// 				this.print_error
	// 			);	
	// 		}));
	// 	}
	// }

	print_error(error_message) {
		Main.notify(Constants.LABEL_NOTIFICATION_TITLE, error_message);
	}

	destroy() {
        this.stop_reminder();
		super.destroy();
	}

});

