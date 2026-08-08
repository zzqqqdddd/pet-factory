use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager, PhysicalPosition, Position, WebviewWindow,
};

mod bundled_pets {
    include!(concat!(env!("OUT_DIR"), "/bundled_pets.rs"));
}

use bundled_pets::BUNDLED_PETS;

const WINDOW_LABEL: &str = "pet";
const EDGE_SNAP_DISTANCE: i32 = 32;

#[tauri::command]
fn clamp_to_work_area(window: WebviewWindow) -> Result<(), String> {
    place_window(&window, false)
}

#[tauri::command]
fn snap_to_edge(window: WebviewWindow) -> Result<(), String> {
    place_window(&window, true)
}

#[tauri::command]
fn place_at_default_edge(window: WebviewWindow) -> Result<(), String> {
    let monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "未找到主显示器".to_owned())?;
    let area = monitor.work_area();
    let size = window.outer_size().map_err(|error| error.to_string())?;

    let x = area.position.x + area.size.width as i32 - size.width as i32;
    let y = area.position.y + area.size.height as i32 - size.height as i32;

    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())
}

fn place_window(window: &WebviewWindow, snap: bool) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window.primary_monitor().map_err(|error| error.to_string())?)
        .ok_or_else(|| "未找到可用显示器".to_owned())?;

    let area = monitor.work_area();
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;

    let min_x = area.position.x;
    let min_y = area.position.y;
    let max_x = min_x + area.size.width as i32 - size.width as i32;
    let max_y = min_y + area.size.height as i32 - size.height as i32;

    let mut x = position.x.clamp(min_x, max_x.max(min_x));
    let y = position.y.clamp(min_y, max_y.max(min_y));

    if snap {
        let left_distance = (x - min_x).abs();
        let right_distance = (max_x - x).abs();

        if left_distance <= EDGE_SNAP_DISTANCE || right_distance <= EDGE_SNAP_DISTANCE {
            x = if left_distance <= right_distance { min_x } else { max_x };
        }
    }

    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|error| error.to_string())
}

fn show_pet(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示宠物", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏宠物", true, None::<&str>)?;
    let pass_through_item =
        CheckMenuItem::with_id(app, "pass-through", "鼠标穿透", true, false, None::<&str>)?;

    let pet_menu = Submenu::new(app, "切换宠物", true)?;
    for (id, display_name) in BUNDLED_PETS {
        let item = MenuItem::with_id(app, format!("pet:{id}"), display_name, true, None::<&str>)?;
        pet_menu.append(&item)?;
    }

    let idle_item = MenuItem::with_id(app, "state:idle", "待机", true, None::<&str>)?;
    let working_item = MenuItem::with_id(app, "state:working", "工作中", true, None::<&str>)?;
    let success_item = MenuItem::with_id(app, "state:success", "成功", true, None::<&str>)?;
    let error_item = MenuItem::with_id(app, "state:error", "出错", true, None::<&str>)?;
    let waiting_item = MenuItem::with_id(app, "state:waiting", "等待", true, None::<&str>)?;
    let review_item = MenuItem::with_id(app, "state:review", "检查", true, None::<&str>)?;
    let waving_item = MenuItem::with_id(app, "state:waving", "挥手", true, None::<&str>)?;
    let look_item = MenuItem::with_id(app, "state:look-around", "环顾", true, None::<&str>)?;

    let animations = Submenu::with_items(
        app,
        "播放动画",
        true,
        &[
            &idle_item,
            &working_item,
            &success_item,
            &error_item,
            &waiting_item,
            &review_item,
            &waving_item,
            &look_item,
        ],
    )?;

    let separator_a = PredefinedMenuItem::separator(app)?;
    let separator_b = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &hide_item,
            &pass_through_item,
            &separator_a,
            &pet_menu,
            &animations,
            &separator_b,
            &quit_item,
        ],
    )?;

    let pass_through_handle = pass_through_item.clone();
    let mut tray_builder = TrayIconBuilder::with_id("pet-factory-tray")
        .tooltip("Pet Factory")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            let id = event.id().as_ref();

            match id {
                "show" => show_pet(app),
                "hide" => {
                    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                        let _ = window.hide();
                    }
                }
                "pass-through" => {
                    let enabled = !pass_through_handle.is_checked().unwrap_or(false);
                    let _ = pass_through_handle.set_checked(enabled);
                    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                        let _ = window.set_ignore_cursor_events(enabled);
                    }
                }
                "quit" => app.exit(0),
                _ => {
                    if let Some(pet_id) = id.strip_prefix("pet:") {
                        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                            let _ = window.emit("pet-select", pet_id);
                        }
                    } else if let Some(state) = id.strip_prefix("state:") {
                        if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                            let _ = window.emit("pet-state", state);
                        }
                    }
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            clamp_to_work_area,
            snap_to_edge,
            place_at_default_edge
        ])
        .setup(|app| {
            create_tray(app)?;

            if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                let window_for_close = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_for_close.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Pet Factory 桌面宠物启动失败");
}
