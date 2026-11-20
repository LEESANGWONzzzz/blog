# -*- coding: utf-8 -*-
"""UNBOXED 네이버 스마트스토어 상품 자동 등록 (커머스API)

products.xlsx 의 상품을 읽어 이미지를 올리고 상품을 등록한다.
처음에는 '미리보기'로 요청 내용을 확인하고, 등록은 기본값이 '전시중지'(SUSPENSION)라서
판매자센터에서 확인한 뒤 직접 전시로 바꾸면 된다.
"""
import base64
import configparser
import csv
import json
import math
import mimetypes
import os
import sys
import time
from datetime import datetime

try:
    import bcrypt
    import requests
    from openpyxl import load_workbook
except ImportError:
    print("필요한 프로그램이 설치되지 않았습니다. '1_설치.bat'을 먼저 실행해 주세요.")
    input("엔터를 누르면 닫힙니다.")
    sys.exit(1)

BASE = "https://api.commerce.naver.com/external"
HERE = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(HERE, "config.ini")
XLSX_PATH = os.path.join(HERE, "products.xlsx")
OUT_DIR = os.path.join(HERE, "결과")

FEE, SHIP, FIXED = 0.0663, 3500, 3066


# ---------- 설정 ----------
def keys_ready(cfg):
    cid = cfg.get("api", "client_id", fallback="").strip()
    sec = cfg.get("api", "client_secret", fallback="").strip()
    return bool(cid and sec and "여기에" not in cid and "여기에" not in sec)


def load_config(require_keys=True):
    if not os.path.exists(CFG_PATH):
        sys.exit("config.ini 파일이 없습니다. 프로그램 폴더에 config.ini가 있는지 확인해 주세요.")
    cfg = configparser.ConfigParser()
    cfg.read(CFG_PATH, encoding="utf-8")
    if require_keys and not keys_ready(cfg):
        sys.exit("config.ini 의 client_id / client_secret 을 먼저 입력해 주세요.")
    return cfg


# ---------- 인증 ----------
_token = {"value": None, "at": 0}


def make_sign(client_id, client_secret, ts):
    """client_id_timestamp 를 client_secret(bcrypt salt)로 해시한 뒤 base64."""
    hashed = bcrypt.hashpw(f"{client_id}_{ts}".encode("utf-8"), client_secret.encode("utf-8"))
    return base64.b64encode(hashed).decode("utf-8")


def get_token(cfg):
    if _token["value"] and time.time() - _token["at"] < 2.5 * 3600:  # 토큰은 3시간 유효
        return _token["value"]
    cid = cfg.get("api", "client_id").strip()
    sec = cfg.get("api", "client_secret").strip()
    ts = int((time.time() - 3) * 1000)  # 서버 시간 오차 대비 3초 이전
    data = {
        "client_id": cid,
        "timestamp": ts,
        "client_secret_sign": make_sign(cid, sec, ts),
        "grant_type": "client_credentials",
        "type": "SELF",
    }
    r = requests.post(f"{BASE}/v1/oauth2/token", data=data, timeout=30)
    if r.status_code != 200:
        explain_error(r)
        raise SystemExit("토큰 발급에 실패했습니다.")
    _token["value"] = r.json()["access_token"]
    _token["at"] = time.time()
    return _token["value"]


def headers(cfg):
    return {"Authorization": f"Bearer {get_token(cfg)}"}


def explain_error(r):
    print(f"\n[오류] HTTP {r.status_code}")
    try:
        body = r.json()
        print(json.dumps(body, ensure_ascii=False, indent=2))
        text = json.dumps(body, ensure_ascii=False)
    except ValueError:
        text = r.text
        print(text[:1500])
    if "IP_NOT_ALLOWED" in text:
        print("→ 이 컴퓨터의 인터넷 IP가 등록되지 않았습니다. 메뉴 '6. 내 IP 확인'으로 IP를 확인하고,"
              "\n  커머스API센터 > 애플리케이션 > 수정 > API호출 IP 에 등록해 주세요.")
    elif r.status_code == 401:
        print("→ client_id / client_secret 이 맞는지, 애플리케이션이 '활성' 상태인지 확인해 주세요.")
    elif r.status_code == 403:
        print("→ 애플리케이션에 이 기능의 API 권한 그룹이 추가되어 있는지 확인해 주세요.")


# ---------- 조회 기능 ----------
def search_categories(cfg, kw=None):
    if kw is None:
        kw = input("찾을 카테고리 단어 (예: 운동화, 패딩, 후드): ").strip()
    r = requests.get(f"{BASE}/v1/categories", headers=headers(cfg), params={"last": "true"}, timeout=60)
    if r.status_code != 200:
        explain_error(r)
        return
    hits = [c for c in r.json() if kw in c.get("wholeCategoryName", "")]
    if not hits:
        print("찾은 카테고리가 없습니다. 다른 단어로 찾아보세요.")
    for c in hits[:40]:
        print(f"{c.get('id')}  {c.get('wholeCategoryName')}")
    print("\n→ 왼쪽 숫자를 products.xlsx 의 '카테고리ID' 칸에 넣으세요.")


def show_addresses(cfg):
    r = requests.get(f"{BASE}/v1/seller/addressbooks-for-page", headers=headers(cfg),
                     params={"page": 1, "size": 50}, timeout=30)
    if r.status_code != 200:
        explain_error(r)
        print("→ 주소록 조회는 애플리케이션에 [판매자정보] 권한 그룹이 필요합니다.")
        return
    body = r.json()
    items = body.get("addressBooks") or body.get("contents") or body
    print(json.dumps(items, ensure_ascii=False, indent=2)[:4000])
    print("\n→ 출고지·반품지의 addressBookNo 를 config.ini 의 shipping_address_id / return_address_id 에 넣으세요.")


def show_ip():
    try:
        print("이 컴퓨터의 인터넷 IP:", requests.get("https://api.ipify.org", timeout=10).text)
        print("→ 이 IP를 커머스API센터 > 애플리케이션 > 수정 > API호출 IP 에 등록하세요.")
    except requests.RequestException:
        print("IP를 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.")


# ---------- 엑셀 읽기 ----------
COLS = ["상품명", "모델코드", "판매가", "매입가", "목표순수익", "재고", "카테고리ID", "브랜드",
        "고시유형", "컬러", "소재", "사이즈옵션", "대표이미지", "추가이미지", "상세HTML파일",
        "상세텍스트", "태그", "전시상태"]


def read_products():
    if not os.path.exists(XLSX_PATH):
        sys.exit("products.xlsx 가 없습니다.")
    ws = load_workbook(XLSX_PATH, data_only=True).active
    head = [str(c.value).strip() if c.value is not None else "" for c in ws[1]]
    missing = [c for c in COLS if c not in head]
    if missing:
        sys.exit("products.xlsx 첫 줄에 없는 칸: " + ", ".join(missing))
    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):  # 2번째 줄은 설명
        d = {h: ("" if v is None else v) for h, v in zip(head, row)}
        if not str(d.get("상품명", "")).strip():
            continue
        d["_row"] = i
        rows.append(d)
    return rows


def to_int(v, default=0):
    try:
        return int(float(str(v).replace(",", "").strip()))
    except ValueError:
        return default


def solve_price(cost, target):
    p = math.ceil(((target + FIXED + cost) / (1 - FEE) - SHIP) / 1000) * 1000
    if (p + SHIP) * (1 - FEE) - FIXED - cost < target:
        p += 1000
    return p


def net_profit(price, cost):
    total = price + SHIP
    return round(total - total * FEE - FIXED - cost)


# ---------- 요청 만들기 ----------
def detail_html(p):
    f = str(p["상세HTML파일"]).strip()
    if f:
        path = f if os.path.isabs(f) else os.path.join(HERE, f)
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    lines = [ln for ln in str(p["상세텍스트"]).splitlines()]
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    body = "".join(f"<p>{esc(ln)}</p>" if ln.strip() else "<p>&nbsp;</p>" for ln in lines)
    return f'<div style="text-align:center;line-height:1.8;font-size:15px">{body}</div>'


def notice(cfg, p):
    kind = str(p["고시유형"]).strip().upper() or "SHOES"
    d = cfg["notice"]
    common = {
        "returnCostReason": d.get("return_cost_reason"),
        "noRefundReason": d.get("no_refund_reason"),
        "qualityAssuranceStandard": d.get("quality_assurance"),
        "compensationProcedure": d.get("compensation"),
        "troubleShootingContents": d.get("trouble_shooting"),
        "material": str(p["소재"]).strip() or "상세페이지 참조",
        "color": str(p["컬러"]).strip() or "상세페이지 참조",
        "size": str(p["사이즈옵션"]).strip() or "상세페이지 참조",
        "manufacturer": d.get("manufacturer"),
        "caution": d.get("caution"),
        "warrantyPolicy": d.get("warranty"),
        "afterServiceDirector": cfg.get("store", "as_phone"),
    }
    if kind == "SHOES":
        common["height"] = "상세페이지 참조"
        return {"productInfoProvidedNoticeType": "SHOES", "shoes": common}
    return {"productInfoProvidedNoticeType": "WEAR", "wear": common}


def options(p, stock):
    sizes = [s.strip() for s in str(p["사이즈옵션"]).replace("，", ",").split(",") if s.strip()]
    if not sizes:
        return None, stock
    per = [to_int(s.split(":")[1]) if ":" in s else stock for s in sizes]
    names = [s.split(":")[0].strip() for s in sizes]
    combos = [{"optionName1": n, "stockQuantity": q, "price": 0, "usable": True} for n, q in zip(names, per)]
    return {
        "optionCombinationSortType": "CREATE",
        "optionCombinationGroupNames": {"optionGroupName1": "사이즈"},
        "optionCombinations": combos,
        "useStockManagement": True,
    }, sum(per)


def build_payload(cfg, p, image_urls):
    s, n = cfg["store"], cfg["notice"]
    price = to_int(p["판매가"])
    if not price:
        price = solve_price(to_int(p["매입가"]), to_int(p["목표순수익"]))
    stock = to_int(p["재고"], 1) or 1
    opt, total_stock = options(p, stock)
    tags = [t.strip().lstrip("#") for t in str(p["태그"]).replace(" ", ";").split(";") if t.strip()][:10]
    status = str(p["전시상태"]).strip().upper()
    if status not in ("ON", "SUSPENSION"):
        status = s.get("default_display_status", "SUSPENSION")

    detail_attr = {
        "naverShoppingSearchInfo": {
            "modelName": str(p["모델코드"]).strip(),
            "brandName": str(p["브랜드"]).strip() or "나이키",
            "manufacturerName": n.get("manufacturer"),
        },
        "afterServiceInfo": {
            "afterServiceTelephoneNumber": s.get("as_phone"),
            "afterServiceGuideContent": s.get("as_guide"),
        },
        "originAreaInfo": {
            "originAreaCode": s.get("origin_area_code"),
            "content": s.get("origin_content"),
            "importer": s.get("importer"),
        },
        "taxType": "TAX",
        "minorPurchasable": True,
        "productInfoProvidedNotice": notice(cfg, p),
        "sellerCodeInfo": {"sellerManagementCode": str(p["모델코드"]).strip()},
    }
    if tags:
        detail_attr["seoInfo"] = {"sellerTags": [{"text": t} for t in tags]}
    if opt:
        detail_attr["optionInfo"] = opt

    origin = {
        "statusType": "SALE",
        "saleType": "NEW",
        "leafCategoryId": str(p["카테고리ID"]).strip(),
        "name": str(p["상품명"]).strip(),
        "detailContent": detail_html(p),
        "images": {
            "representativeImage": {"url": image_urls[0]},
            "optionalImages": [{"url": u} for u in image_urls[1:10]],
        },
        "salePrice": price,
        "stockQuantity": total_stock,
        "deliveryInfo": {
            "deliveryType": "DELIVERY",
            "deliveryAttributeType": "NORMAL",
            "deliveryCompany": s.get("delivery_company"),
            "deliveryFee": {
                "deliveryFeeType": "PAID",
                "baseFee": to_int(s.get("delivery_fee")),
                "deliveryFeePayType": "PREPAID",
            },
            "claimDeliveryInfo": {
                "returnDeliveryFee": to_int(s.get("return_fee")),
                "exchangeDeliveryFee": to_int(s.get("exchange_fee")),
                "shippingAddressId": to_int(s.get("shipping_address_id")) or None,
                "returnAddressId": to_int(s.get("return_address_id")) or None,
            },
        },
        "detailAttribute": detail_attr,
    }
    payload = {
        "originProduct": origin,
        "smartstoreChannelProduct": {
            "naverShoppingRegistration": True,
            "channelProductDisplayStatusType": status,
        },
    }
    return payload, price


# ---------- 이미지 ----------
def image_paths(p):
    files = [str(p["대표이미지"]).strip()] + [x.strip() for x in str(p["추가이미지"]).split(";") if x.strip()]
    out = []
    for f in files:
        if not f:
            continue
        path = f if os.path.isabs(f) else os.path.join(HERE, "이미지", f)
        if not os.path.exists(path):
            raise FileNotFoundError(f"이미지 파일이 없습니다: {path}")
        out.append(path)
    if not out:
        raise FileNotFoundError("대표이미지가 비어 있습니다.")
    return out[:10]


def upload_images(cfg, paths):
    files = []
    handles = []
    try:
        for pth in paths:
            mime = mimetypes.guess_type(pth)[0] or "image/jpeg"
            fh = open(pth, "rb")
            handles.append(fh)
            files.append(("imageFiles", (os.path.basename(pth), fh, mime)))
        r = requests.post(f"{BASE}/v1/product-images/upload", headers=headers(cfg), files=files, timeout=120)
    finally:
        for fh in handles:
            fh.close()
    if r.status_code != 200:
        explain_error(r)
        raise RuntimeError("이미지 업로드 실패")
    return [img["url"] for img in r.json().get("images", [])]


# ---------- 실행 ----------
def run(cfg, send):
    rows = read_products()
    if not rows:
        print("products.xlsx 에 상품이 없습니다.")
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(OUT_DIR, f"{'등록' if send else '미리보기'}_{stamp}.csv")
    with open(log_path, "w", newline="", encoding="utf-8-sig") as lf:
        w = csv.writer(lf)
        w.writerow(["엑셀줄", "상품명", "판매가", "순수익(매입가 있을 때)", "결과", "상품번호/메모"])
        for p in rows:
            name = str(p["상품명"]).strip()
            print(f"\n▶ {p['_row']}줄  {name}")
            try:
                if len(name) > 50:
                    print(f"  주의: 상품명이 {len(name)}자입니다 (50자 권장).")
                if not str(p["카테고리ID"]).strip():
                    raise ValueError("카테고리ID가 비어 있습니다. 메뉴 '2. 카테고리 찾기'로 찾아 넣으세요.")
                paths = image_paths(p)
                urls = upload_images(cfg, paths) if send else [f"(미리보기) {os.path.basename(x)}" for x in paths]
                payload, price = build_payload(cfg, p, urls)
                cost = to_int(p["매입가"])
                profit = net_profit(price, cost) if cost else ""
                print(f"  판매가 {price:,}원" + (f" / 순수익 약 {profit:,}원" if profit != "" else ""))
                if not send:
                    jp = os.path.join(OUT_DIR, f"미리보기_{stamp}_{p['_row']}줄.json")
                    with open(jp, "w", encoding="utf-8") as jf:
                        json.dump(payload, jf, ensure_ascii=False, indent=2)
                    w.writerow([p["_row"], name, price, profit, "미리보기", os.path.basename(jp)])
                    print(f"  요청 내용 저장: {jp}")
                    continue
                r = requests.post(f"{BASE}/v2/products", headers={**headers(cfg), "Content-Type": "application/json"},
                                  data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), timeout=120)
                if r.status_code in (200, 201):
                    body = r.json()
                    no = body.get("smartstoreChannelProductNo") or body.get("originProductNo")
                    print(f"  등록 완료 (상품번호 {no})")
                    w.writerow([p["_row"], name, price, profit, "등록 완료", no])
                else:
                    explain_error(r)
                    w.writerow([p["_row"], name, price, profit, f"실패 {r.status_code}", r.text[:300]])
                time.sleep(1)  # 연속 호출 간격
            except Exception as e:  # 한 상품이 실패해도 다음 상품은 계속
                print(f"  실패: {e}")
                w.writerow([p["_row"], name, "", "", "실패", str(e)])
    print(f"\n결과 파일: {log_path}")


def check_pc(cfg):
    """새 컴퓨터에서 준비가 됐는지 한 번에 점검한다."""
    print("\n[환경 점검]")
    print(f" - 파이썬 {sys.version.split()[0]}  : OK")
    print(" - 필요한 부품(requests, bcrypt, openpyxl) : OK")
    print(f" - products.xlsx : {'OK' if os.path.exists(XLSX_PATH) else '없음'}")
    print(f" - 이미지 폴더 : {'OK' if os.path.isdir(os.path.join(HERE, '이미지')) else '없음'}")
    print(f" - API 키 입력 : {'OK' if keys_ready(cfg) else '아직 안 함 (config.ini 입력 필요)'}")
    for k in ("shipping_address_id", "return_address_id"):
        print(f" - {k} : {'OK' if cfg.get('store', k, fallback='').strip() else '비어 있음 (메뉴 3)'}")
    try:
        ip = requests.get("https://api.ipify.org", timeout=10).text
        print(f" - 이 컴퓨터의 인터넷 IP : {ip}  ← 커머스API센터 API호출 IP에 등록되어 있어야 합니다")
    except requests.RequestException:
        print(" - 인터넷 IP 확인 실패 (인터넷 연결 또는 회사 방화벽 확인)")
    try:
        requests.get(f"{BASE}/v1/categories", timeout=15)
        print(" - 네이버 커머스API 접속 : OK")
    except requests.RequestException:
        print(" - 네이버 커머스API 접속 실패 → 회사 방화벽/보안 프로그램이 api.commerce.naver.com 을 막는지 확인")
    if keys_ready(cfg):
        try:
            get_token(cfg)
            print(" - 토큰 발급 : OK (이 컴퓨터에서 등록 가능)")
        except SystemExit as e:
            print(f" - 토큰 발급 실패: {e}")


def main():
    cfg = load_config(require_keys=False)
    if not keys_ready(cfg):
        print("※ config.ini 에 client_id / client_secret 을 아직 입력하지 않았습니다. (6·7번은 지금도 사용 가능)")
    menu = """
=============================================
  UNBOXED 스마트스토어 자동 등록
=============================================
 1. 연결 테스트 (토큰 발급)
 2. 카테고리 찾기
 3. 주소록(출고지·반품지) 번호 보기
 4. 미리보기 (등록하지 않고 요청 내용만 저장)
 5. 상품 등록하기
 6. 내 IP 확인
 7. 이 컴퓨터 환경 점검 (새 PC 세팅 확인)
 0. 끝내기
"""
    while True:
        print(menu)
        c = input("번호를 입력하세요: ").strip()
        try:
            if c in ("1", "2", "3", "4", "5") and not keys_ready(cfg):
                print("먼저 config.ini 에 client_id / client_secret 을 입력하고 프로그램을 다시 실행해 주세요.")
                continue
            if c == "1":
                get_token(cfg)
                print("연결 성공! 토큰을 받았습니다.")
            elif c == "2":
                search_categories(cfg)
            elif c == "3":
                show_addresses(cfg)
            elif c == "4":
                run(cfg, send=False)
            elif c == "5":
                ok = input("products.xlsx 의 상품을 실제로 등록합니다. 진행할까요? (y 입력): ").strip().lower()
                if ok == "y":
                    run(cfg, send=True)
            elif c == "6":
                show_ip()
            elif c == "7":
                check_pc(cfg)
            elif c == "0":
                break
        except SystemExit as e:
            print(e)
        except requests.RequestException as e:
            print("인터넷 연결 오류:", e)


def cli(args):
    """Claude Code 같은 도우미가 메뉴 없이 실행할 때 쓰는 명령.
    python unboxed_uploader.py check | preview | category 단어 | upload --confirm
    """
    cmd = args[0]
    if cmd == "check":
        check_pc(load_config(require_keys=False))
    elif cmd == "preview":
        run(load_config(), send=False)
    elif cmd == "category":
        search_categories(load_config(), " ".join(args[1:]).strip())
    elif cmd == "upload":
        if "--confirm" not in args:
            sys.exit("실제 등록은 사용자가 확인한 뒤 'upload --confirm' 으로만 실행합니다.")
        run(load_config(), send=True)
    else:
        sys.exit("사용법: check | preview | category 단어 | upload --confirm")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cli(sys.argv[1:])
    else:
        main()
