#!/usr/bin/env python3
"""Проверка базы рецептов и сборка бандла для file://.

    python3 tools/sync_recipes.py            # проверить JSON и пересобрать data/recipes.bundle.js
    python3 tools/sync_recipes.py --check    # только проверить (код 1, если бандл устарел)

Почему два файла: fetch() не читает локальные JSON при открытии страницы
двойным кликом (file://), поэтому рядом с канонической базой лежит
сгенерированный бандл с тем же содержимым в виде window.RECIPE_DB.
Правим только data/recipes.json, бандл собирается этим скриптом.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "recipes.json"
BUNDLE_PATH = ROOT / "data" / "recipes.bundle.js"

SLUG = re.compile(r"^[a-z0-9_-]+$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DIFFICULTY = {"easy", "medium", "hard"}
TOP_KEYS = {"schemaVersion", "title", "updated", "categories", "holidays", "recipes"}
RECIPE_KEYS = {
    "id", "title", "category", "holidays", "tags", "description", "servings",
    "yield", "time", "difficulty", "allergens", "storage", "ingredients",
    "steps", "tips", "image",
}
OPTIONAL_RECIPE_KEYS = {
    "tags", "difficulty", "allergens", "storage", "tips", "image", "yield",
}
INGREDIENT_KEYS = {"name", "amount", "unit", "note"}


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate(data):
    errors, warnings = [], []

    if not isinstance(data, dict):
        return ["корень файла должен быть объектом"], warnings

    for key in sorted(TOP_KEYS - set(data)):
        errors.append(f"нет обязательного поля «{key}»")
    for key in sorted(set(data) - TOP_KEYS):
        warnings.append(f"неизвестное поле верхнего уровня «{key}»")

    if not is_int(data.get("schemaVersion")) or data.get("schemaVersion", 0) < 1:
        errors.append("schemaVersion должен быть целым числом >= 1")
    if not DATE.match(str(data.get("updated", ""))):
        errors.append("updated должен быть в формате ГГГГ-ММ-ДД")

    categories = data.get("categories")
    holidays = data.get("holidays")
    category_ids, holiday_ids = set(), set()

    if not isinstance(categories, list) or not categories:
        errors.append("categories должен быть непустым массивом")
        categories = []
    for index, category in enumerate(categories):
        where = f"categories[{index}]"
        if not isinstance(category, dict):
            errors.append(f"{where}: должен быть объектом")
            continue
        cid = category.get("id")
        if not isinstance(cid, str) or not SLUG.match(cid):
            errors.append(f"{where}: id должен быть латиницей в нижнем регистре")
        elif cid in category_ids:
            errors.append(f"{where}: повторяется id «{cid}»")
        else:
            category_ids.add(cid)
        if not str(category.get("title", "")).strip():
            errors.append(f"{where}: пустой title")

    if not isinstance(holidays, list):
        errors.append("holidays должен быть массивом")
        holidays = []
    for index, holiday in enumerate(holidays):
        where = f"holidays[{index}]"
        if not isinstance(holiday, dict):
            errors.append(f"{where}: должен быть объектом")
            continue
        hid = holiday.get("id")
        if not isinstance(hid, str) or not SLUG.match(hid):
            errors.append(f"{where}: id должен быть латиницей в нижнем регистре")
        elif hid in holiday_ids:
            errors.append(f"{where}: повторяется id «{hid}»")
        else:
            holiday_ids.add(hid)
        if not str(holiday.get("title", "")).strip():
            errors.append(f"{where}: пустой title")

    recipes = data.get("recipes")
    if not isinstance(recipes, list) or not recipes:
        errors.append("recipes должен быть непустым массивом")
        recipes = []

    recipe_ids = set()
    for index, recipe in enumerate(recipes):
        errors.extend(check_recipe(recipe, index, category_ids, holiday_ids, recipe_ids, warnings))

    return errors, warnings


def check_recipe(recipe, index, category_ids, holiday_ids, recipe_ids, warnings):
    errors = []
    where = f"recipes[{index}]"

    if not isinstance(recipe, dict):
        return [f"{where}: должен быть объектом"]

    rid = recipe.get("id")
    if not isinstance(rid, str) or not SLUG.match(rid):
        errors.append(f"{where}: id должен быть латиницей в нижнем регистре")
    elif rid in recipe_ids:
        errors.append(f"{where}: повторяется id «{rid}»")
    else:
        recipe_ids.add(rid)
        where = f"recipe «{rid}»"

    for key in sorted((RECIPE_KEYS - OPTIONAL_RECIPE_KEYS) - set(recipe)):
        errors.append(f"{where}: нет обязательного поля «{key}»")
    for key in sorted(set(recipe) - RECIPE_KEYS):
        warnings.append(f"{where}: неизвестное поле «{key}»")

    for key in ("title", "description"):
        if not str(recipe.get(key, "")).strip():
            errors.append(f"{where}: пустое поле {key}")

    if recipe.get("category") not in category_ids:
        errors.append(f"{where}: категория «{recipe.get('category')}» отсутствует в categories")

    for hid in recipe.get("holidays") or []:
        if hid not in holiday_ids:
            errors.append(f"{where}: праздник «{hid}» отсутствует в holidays")

    servings = recipe.get("servings")
    if not is_int(servings) or servings < 1:
        errors.append(f"{where}: servings должен быть целым числом >= 1")

    time = recipe.get("time")
    if not isinstance(time, dict):
        errors.append(f"{where}: time должен быть объектом с полями prep и cook")
    else:
        for key in ("prep", "cook"):
            value = time.get(key)
            if not is_int(value) or value < 0:
                errors.append(f"{where}: time.{key} должен быть целым числом >= 0")

    difficulty = recipe.get("difficulty")
    if difficulty is not None and difficulty not in DIFFICULTY:
        errors.append(f"{where}: difficulty должен быть easy, medium или hard")

    for list_key in ("tags", "allergens"):
        value = recipe.get(list_key)
        if value is not None and not isinstance(value, list):
            errors.append(f"{where}: {list_key} должен быть массивом")

    errors.extend(check_ingredients(recipe, where, warnings))
    errors.extend(check_steps(recipe, where))
    return errors


def check_ingredients(recipe, where, warnings):
    errors = []
    ingredients = recipe.get("ingredients")
    if not isinstance(ingredients, list) or not ingredients:
        return [f"{where}: ingredients должен быть непустым массивом"]

    for index, ingredient in enumerate(ingredients):
        spot = f"{where}, ingredients[{index}]"
        if not isinstance(ingredient, dict):
            errors.append(f"{spot}: должен быть объектом")
            continue
        if not str(ingredient.get("name", "")).strip():
            errors.append(f"{spot}: пустое name")
        for key in sorted(set(ingredient) - INGREDIENT_KEYS):
            warnings.append(f"{spot}: неизвестное поле «{key}»")
        amount = ingredient.get("amount")
        if amount is not None and (
            not isinstance(amount, (int, float)) or isinstance(amount, bool) or amount < 0
        ):
            errors.append(f"{spot}: amount должен быть числом >= 0 или null")
        for key in ("unit", "note"):
            if key in ingredient and not isinstance(ingredient[key], str):
                errors.append(f"{spot}: {key} должен быть строкой")
    return errors


def check_steps(recipe, where):
    errors = []
    steps = recipe.get("steps")
    if not isinstance(steps, list) or not steps:
        return [f"{where}: steps должен быть непустым массивом"]
    for index, step in enumerate(steps):
        if not isinstance(step, str) or not step.strip():
            errors.append(f"{where}, steps[{index}]: пустой шаг")
    return errors


def build_bundle(data):
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    header = (
        "/* ==========================================================================\n"
        "   recipes.bundle.js — СГЕНЕРИРОВАННЫЙ файл, не редактируйте вручную.\n"
        "   Источник: data/recipes.json\n"
        "   Пересобрать: python3 tools/sync_recipes.py\n"
        "   Нужен, чтобы страница работала при открытии по file:// (без сервера).\n"
        "   ========================================================================== */\n\n"
    )
    return header + "window.RECIPE_DB = " + payload + ";\n"


def main(argv):
    check_only = "--check" in argv
    try:
        data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"× нет файла {JSON_PATH.relative_to(ROOT)}")
        return 1
    except json.JSONDecodeError as error:
        print(f"× {JSON_PATH.relative_to(ROOT)}: {error}")
        return 1

    errors, warnings = validate(data)
    for warning in warnings:
        print(f"! {warning}")
    for error in errors:
        print(f"× {error}")
    if errors:
        print(f"\n× проверка не пройдена: {len(errors)} ошибок")
        return 1

    recipes = data["recipes"]
    ingredients = sum(len(recipe.get("ingredients", [])) for recipe in recipes)
    steps = sum(len(recipe.get("steps", [])) for recipe in recipes)
    print(f"✓ JSON валиден: рецептов {len(recipes)}, ингредиентов {ingredients}, шагов {steps}")

    bundle = build_bundle(data)

    if check_only:
        if not BUNDLE_PATH.exists():
            print("× бандл отсутствует — запустите python3 tools/sync_recipes.py")
            return 1
        if BUNDLE_PATH.read_text(encoding="utf-8") != bundle:
            print("× бандл рассинхронизирован с data/recipes.json — пересоберите его")
            return 1
        print("✓ бандл совпадает с базой")
        return 0

    BUNDLE_PATH.write_text(bundle, encoding="utf-8")
    print(f"✓ собран {BUNDLE_PATH.relative_to(ROOT)} ({BUNDLE_PATH.stat().st_size} байт)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
