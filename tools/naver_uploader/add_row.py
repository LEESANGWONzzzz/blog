# -*- coding: utf-8 -*-
"""products.xlsx 에 상품 한 줄을 추가한다. (도우미용)

사용법: python add_row.py 상품.json
상품.json 은 products.xlsx 머리글과 같은 키를 가진 JSON 객체 하나.
이미지 칸이 비어 있으면 images 폴더에서 모델코드로 시작하는 파일을 찾아 채운다.
"""
import glob
import json
import os
import sys

from openpyxl import load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, "products.xlsx")
IMG = os.path.join(HERE, "images")


def find_images(code):
    if not code:
        return []
    pats = []
    for ext in ("jpg", "jpeg", "png", "gif", "bmp", "JPG", "JPEG", "PNG"):
        pats += glob.glob(os.path.join(IMG, f"{code}*.{ext}"))
    return sorted({os.path.basename(p) for p in pats})


def main(path):
    with open(path, encoding="utf-8") as f:
        item = json.load(f)
    wb = load_workbook(XLSX)
    ws = wb.active
    head = [str(c.value).strip() if c.value is not None else "" for c in ws[1]]
    if not str(item.get("대표이미지", "")).strip():
        imgs = find_images(str(item.get("모델코드", "")).strip())
        if imgs:
            item["대표이미지"] = imgs[0]
            item["추가이미지"] = ";".join(imgs[1:10])
    row = [item.get(h, "") for h in head]
    ws.append(row)
    wb.save(XLSX)
    print(f"products.xlsx {ws.max_row}줄에 추가: {item.get('상품명', '')}")
    print(f"이미지: {item.get('대표이미지') or '(없음 - images 폴더에 모델코드로 시작하는 사진을 넣어 주세요)'}"
          + (f" 외 {len(str(item.get('추가이미지','')).split(';'))}장" if item.get("추가이미지") else ""))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("사용법: python add_row.py 상품.json")
    main(sys.argv[1])
