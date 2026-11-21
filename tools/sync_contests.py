#!/usr/bin/env python3
"""Проверка базы конкурсов и сборка бандла для file://.

    python3 tools/sync_contests.py            # проверить JSON и пересобрать data/contests.bundle.js
    python3 tools/sync_contests.py --check    # только проверить (код 1, если бандл устарел)

Правим только data/contests.json, бандл data/contests.bundle.js собирается
этим скриптом. По аналогии с рецептами бандл нужен для работы по file://,
где браузеры не дают читать локальный JSON через fetch.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "contests.json"
BUNDLE_PATH = ROOT / "data" / "contests.bundle.js"

SLUG = re.compile(r"^[a-z0-9_-]+$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FORMATS = {"individual", "team", "pair"}
TOP_KEYS = {"schemaVersion", "title", "updated", "types", "audiences", "contests"}
TYPE_KEYS = {"id", "title", "icon", "order"}
AUDIENCE_KEYS = {"id", "title", "order"}
CONTEST_KEYS = {
    "id", "title", "type", "audiences", "minAge", "duration", "players",
    "format", "props", "tags", "description", "rules", "tip",
}


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
    if not str(data.get("title", "")).strip():
        errors.append("пустой title")
    if not DATE.match(str(data.get("updated", ""))):
        errors.append("updated должен быть в формате ГГГГ-ММ-ДД")

    type_ids = read_refs(data.get("types"), "types", TYPE_KEYS, errors, warnings)
    audience_ids = read_refs(
        data.get("audiences"), "audiences", AUDIENCE_KEYS, errors, warnings
    )

    contests = data.get("contests")
    if not isinstance(contests, list) or not contests:
        errors.append("contests должен быть непустым массивом")
        contests = []

    contest_ids = set()
    titles = set()
    type_counts = {}
    for index, contest in enumerate(contests):
        errors.extend(
            check_contest(
                contest, index, type_ids, audience_ids, contest_ids, titles,
                type_counts, warnings,
            )
        )

    for type_id in type_ids:
        count = type_counts.get(type_id, 0)
        if count != 25:
            warnings.append(f"тип «{type_id}»: конкурсов {count}, ожидается 25")

    new_year = sum(
        1 for contest in contests
        if isinstance(contest.get("tags"), list)
        and "новогодний" in contest["tags"]
    )
    if new_year != 20:
        warnings.append(f"новогодних конкурсов {new_year}, ожидается 20")
    if len(contests) != 200:
        warnings.append(f"всего конкурсов {len(contests)}, ожидается 200")

    return errors, warnings


def read_refs(value, where, keys, errors, warnings):
    ids = []
    if not isinstance(value, list) or not value:
        errors.append(f"{where} должен быть непустым массивом")
        return ids
    for index, item in enumerate(value):
        spot = f"{where}[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{spot}: должен быть объектом")
            continue
        item_id = item.get("id")
        if not isinstance(item_id, str) or not SLUG.match(item_id):
            errors.append(f"{spot}: id должен быть латиницей в нижнем регистре")
        elif item_id in ids:
            errors.append(f"{spot}: повторяется id «{item_id}»")
        else:
            ids.append(item_id)
        if not str(item.get("title", "")).strip():
            errors.append(f"{spot}: пустой title")
        for key in sorted(set(item) - keys):
            warnings.append(f"{spot}: неизвестное поле «{key}»")
    return ids


def check_contest(contest, index, type_ids, audience_ids, contest_ids, titles,
                  type_counts, warnings):
    errors = []
    where = f"contests[{index}]"
    if not isinstance(contest, dict):
        return [f"{where}: должен быть объектом"]

    cid = contest.get("id")
    if not isinstance(cid, str) or not SLUG.match(cid):
        errors.append(f"{where}: id должен быть латиницей в нижнем регистре")
    elif cid in contest_ids:
        errors.append(f"{where}: повторяется id «{cid}»")
    else:
        contest_ids.add(cid)
        where = f"конкурс «{cid}»"

    for key in sorted(CONTEST_KEYS - set(contest)):
        errors.append(f"{where}: нет обязательного поля «{key}»")
    for key in sorted(set(contest) - CONTEST_KEYS):
        warnings.append(f"{where}: неизвестное поле «{key}»")

    if not str(contest.get("title", "")).strip():
        errors.append(f"{where}: пустой title")
    else:
        title = contest["title"].strip().lower()
        if title in titles:
            errors.append(f"{where}: повторяется название «{contest['title']}»")
        titles.add(title)

    ctype = contest.get("type")
    if ctype not in type_ids:
        errors.append(f"{where}: тип «{ctype}» отсутствует в types")
    else:
        type_counts[ctype] = type_counts.get(ctype, 0) + 1

    audiences = contest.get("audiences")
    if not isinstance(audiences, list) or not audiences:
        errors.append(f"{where}: audiences должен быть непустым массивом")
    else:
        for audience in audiences:
            if audience not in audience_ids:
                errors.append(f"{where}: аудитория «{audience}» отсутствует в audiences")
        if len(audiences) != len(set(audiences)):
            errors.append(f"{where}: audiences не должен содержать повторов")

    min_age = contest.get("minAge")
    if not is_int(min_age) or not 0 <= min_age <= 18:
        errors.append(f"{where}: minAge должен быть целым числом 0–18")
    duration = contest.get("duration")
    if not is_int(duration) or duration < 1:
        errors.append(f"{where}: duration должен быть целым числом >= 1")
    if not str(contest.get("players", "")).strip():
        errors.append(f"{where}: пустое поле players")
    if contest.get("format") not in FORMATS:
        errors.append(f"{where}: format должен быть individual, team или pair")

    for list_key in ("props", "tags"):
        value = contest.get(list_key)
        if not isinstance(value, list):
            errors.append(f"{where}: {list_key} должен быть массивом")
            continue
        for item in value:
            if not isinstance(item, str) or not item.strip():
                errors.append(f"{where}: {list_key} должен содержать непустые строки")
        if len(value) != len(set(value)):
            errors.append(f"{where}: {list_key} не должен содержать повторов")

    if not str(contest.get("description", "")).strip():
        errors.append(f"{where}: пустое поле description")
    rules = contest.get("rules")
    if not isinstance(rules, list) or not 3 <= len(rules) <= 8:
        errors.append(f"{where}: rules должен содержать 3–8 шагов")
    elif any(not isinstance(step, str) or not step.strip() for step in rules):
        errors.append(f"{where}: steps должны быть непустыми строками")
    if not str(contest.get("tip", "")).strip():
        errors.append(f"{where}: пустое поле tip")

    return errors


def build_bundle(data):
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    return (
        "/* Сгенерировано tools/sync_contests.py — не редактировать вручную. */\n"
        "window.CONTEST_DB = " + payload + ";\n"
    )


def main(argv):
    check_only = "--check" in argv
    if not JSON_PATH.exists():
        print(f"× нет файла {JSON_PATH.relative_to(ROOT)}")
        return 1
    try:
        data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"× {JSON_PATH.relative_to(ROOT)}: {error}")
        return 1

    errors, warnings = validate(data)
    for warning in warnings:
        print(f"! {warning}")
    if errors:
        for error in errors:
            print(f"× {error}")
        print(f"\n× проверка не пройдена: {len(errors)} ошибок")
        return 1

    contests = data["contests"]
    print(
        f"✓ JSON валиден: конкурсов {len(contests)}, "
        f"типов {len(data['types'])}, аудиторий {len(data['audiences'])}"
    )

    bundle = build_bundle(data)
    if check_only:
        if not BUNDLE_PATH.exists():
            print("× бандл отсутствует — запустите python3 tools/sync_contests.py")
            return 1
        if BUNDLE_PATH.read_text(encoding="utf-8") != bundle:
            print("× бандл рассинхронизирован с data/contests.json — пересоберите его")
            return 1
        print("✓ бандл совпадает с базой")
        return 0

    BUNDLE_PATH.write_text(bundle, encoding="utf-8")
    print(f"✓ собран {BUNDLE_PATH.relative_to(ROOT)} ({BUNDLE_PATH.stat().st_size} байт)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
