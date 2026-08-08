use serde::Deserialize;
use std::{env, fs, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: String,
    display_name: String,
    sprite_version_number: Option<u32>,
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("缺少 Cargo manifest 路径"));
    let pets_dir = manifest_dir.join("..").join("..").join("pets");
    println!("cargo:rerun-if-changed={}", pets_dir.display());

    let mut pets = Vec::new();
    let directories = fs::read_dir(&pets_dir)
        .unwrap_or_else(|error| panic!("无法读取 pets 目录 {}：{error}", pets_dir.display()));

    for directory in directories.flatten() {
        let manifest_path = directory.path().join("pet.json");
        let spritesheet_path = directory.path().join("spritesheet.webp");
        if !manifest_path.is_file() || !spritesheet_path.is_file() {
            continue;
        }

        println!("cargo:rerun-if-changed={}", manifest_path.display());
        println!("cargo:rerun-if-changed={}", spritesheet_path.display());

        let manifest: PetManifest = serde_json::from_slice(
            &fs::read(&manifest_path)
                .unwrap_or_else(|error| panic!("无法读取 {}：{error}", manifest_path.display())),
        )
        .unwrap_or_else(|error| panic!("无法解析 {}：{error}", manifest_path.display()));

        if manifest.sprite_version_number != Some(2) {
            println!(
                "cargo:warning=跳过 {}：仅支持 hatch-pet v2 图集",
                manifest.id
            );
            continue;
        }

        pets.push((manifest.id, manifest.display_name));
    }

    pets.sort_by(|left, right| left.1.cmp(&right.1));
    assert!(!pets.is_empty(), "pets 目录中没有可用的 hatch-pet v2 角色");

    let entries = pets
        .iter()
        .map(|(id, name)| format!("    ({id:?}, {name:?}),"))
        .collect::<Vec<_>>()
        .join("\n");
    let generated = format!("pub const BUNDLED_PETS: &[(&str, &str)] = &[\n{entries}\n];\n");
    let output = PathBuf::from(env::var("OUT_DIR").expect("缺少 Rust 输出目录"))
        .join("bundled_pets.rs");
    fs::write(output, generated).expect("无法写入内置宠物目录");

    tauri_build::build()
}
