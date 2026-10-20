#!/usr/bin/env python3
"""Generate clearly synthetic, fillable LIC 624-compatible intake fixtures.

These PDFs exercise the Platform's existing AcroForm field mapping. They are
not official state forms or reports of actual events and must never be filed.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen.canvas import Canvas


PAGE_W, PAGE_H = letter
INK = colors.HexColor("#172a3a")
LINE = colors.HexColor("#8b9ba1")
RED = colors.HexColor("#a53a2b")

NARRATIVE_FIELD = (
    "Describe event or incident. include time, date, perpetrator, nature of "
    "incident, any antecedents leading up to incident and how clients were "
    "affected including any injuries"
)
ACTION_FIELD = "Explain what immediate action was taken, (include persons contacted)"

SCENARIOS = (
    ("injury_accident", "Client Abuse10", "Injury - accident", True),
    ("medical_emergency", "Client Abuse16", "Medical emergency", True),
    ("unauthorized_absence", "Type of Incident", "Unauthorized absence", False),
    ("property_damage", "Client Abuse20", "Property damage", False),
    ("hospitalization", "Client Abuse15", "Hospitalization", True),
)


def label(canvas: Canvas, value: str, x: float, y: float, size: int = 8) -> None:
    canvas.setFont("Helvetica-Bold", size)
    canvas.setFillColor(INK)
    canvas.drawString(x, y, value)


def text_field(
    canvas: Canvas,
    name: str,
    value: str,
    x: float,
    y: float,
    width: float,
    height: float = 24,
    *,
    multiline: bool = False,
    size: int = 10,
) -> None:
    canvas.acroForm.textfield(
        name=name,
        tooltip=name,
        value=value,
        x=x,
        y=y,
        width=width,
        height=height,
        borderWidth=0.7,
        borderColor=LINE,
        fillColor=colors.white,
        textColor=INK,
        fontName="Helvetica",
        fontSize=size,
        fieldFlags="multiline" if multiline else "",
        forceBorder=True,
    )


def check_field(canvas: Canvas, name: str, x: float, y: float, checked: bool) -> None:
    canvas.acroForm.checkbox(
        name=name,
        tooltip=name,
        x=x,
        y=y,
        size=13,
        checked=checked,
        buttonStyle="check",
        borderWidth=0.8,
        borderColor=LINE,
        fillColor=colors.white,
        textColor=INK,
        forceBorder=True,
    )


def page_header(canvas: Canvas, number: int, index: int) -> None:
    canvas.setFillColor(RED)
    canvas.rect(0, PAGE_H - 45, PAGE_W, 45, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(32, PAGE_H - 28, "SYNTHETIC DEMO - NOT A STATE FILING")
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_W - 32, PAGE_H - 61, f"Fixture {index:03d}  |  Page {number} of 2")
    canvas.setFont("Helvetica-Bold", 15)
    canvas.drawString(32, PAGE_H - 86, "UNUSUAL INCIDENT / INJURY REPORT")
    canvas.setFont("Helvetica", 8)
    canvas.drawString(32, PAGE_H - 101, "LIC 624-compatible field layout for Platform upload and extraction testing")
    canvas.setStrokeColor(LINE)
    canvas.line(32, PAGE_H - 109, PAGE_W - 32, PAGE_H - 109)
    canvas.setFont("Helvetica-Bold", 7)
    canvas.setFillColor(RED)
    canvas.drawCentredString(PAGE_W / 2, 21, "FICTIONAL TEST DATA - DO NOT SUBMIT TO LICENSING")


def section(canvas: Canvas, title: str, y: float) -> None:
    canvas.setFillColor(colors.HexColor("#eaf0f1"))
    canvas.rect(32, y - 6, PAGE_W - 64, 24, stroke=0, fill=1)
    label(canvas, title, 40, y + 2, 9)


def form_for(index: int, destination: Path) -> dict:
    key, checkbox, description, treatment_needed = SCENARIOS[(index - 1) % len(SCENARIOS)]
    occurred = date(2026, 10, 1) + timedelta(days=(index - 1) % 18)
    occurred_text = occurred.strftime("%m/%d/%Y")
    resident = f"Demo Resident {index:03d}"
    event_lines = (
        f"SYNTHETIC CASE {index:03d}: {description} on {occurred_text} for {resident}.",
        "Simulated event in the demo program. No real person was harmed.",
    )
    action_lines = (
        "Demo staff checked safety and documented the simulated event.",
        "Demo supervisor notified in test only. No real services requested.",
    )
    canvas = Canvas(str(destination), pagesize=letter, pageCompression=1)
    canvas.setTitle(f"SYNTHETIC LIC 624 fixture {index:03d} - not for filing")
    canvas.setAuthor("Alamo Platform synthetic QA")
    canvas.setSubject("Fictional AcroForm intake and extraction test")

    page_header(canvas, 1, index)
    section(canvas, "FACILITY AND PEOPLE INVOLVED", 665)
    label(canvas, "FACILITY", 40, 636)
    text_field(canvas, "Facility", "San Pablo Synthetic Demo Facility", 40, 606, 345)
    label(canvas, "FACILITY FILE NUMBER", 397, 636)
    text_field(canvas, "Facility File Number", "DEMO-337-ONLY", 397, 606, 175)
    label(canvas, "TELEPHONE", 40, 593)
    text_field(canvas, "Phone", "000-000-0000", 40, 563, 180)
    label(canvas, "ADDRESS", 231, 593)
    text_field(canvas, "Address", "No real address - synthetic QA", 231, 563, 341)
    label(canvas, "CITY, STATE, ZIP", 40, 550)
    text_field(canvas, "City State", "San Pablo, CA - TEST ONLY", 40, 520, 532)

    section(canvas, "CLIENT / RESIDENT INVOLVED", 493)
    for heading, x in (("NAME", 40), ("DATE OCCURRED", 237), ("AGE", 355), ("SEX", 414), ("ADMITTED", 466)):
        label(canvas, heading, x, 464)
    text_field(canvas, "Name of client's residents involved1", resident, 40, 434, 188)
    text_field(canvas, "Date Occurred", occurred_text, 237, 434, 109)
    text_field(canvas, "Age", str(30 + index % 25), 355, 434, 50)
    text_field(canvas, "Sex", "N/A", 414, 434, 44, size=9)
    text_field(canvas, "Date of Admission", "01/15/2026", 466, 434, 106)

    section(canvas, "TYPE OF INCIDENT (STATE FORM VOCABULARY)", 408)
    for n, (scenario_key, field_name, heading, _) in enumerate(SCENARIOS):
        x = 40 + (n % 3) * 180
        y = 376 - (n // 3) * 28
        check_field(canvas, field_name, x, y, scenario_key == key)
        label(canvas, heading, x + 19, y + 3, 7)

    section(canvas, "EVENT AND IMMEDIATE RESPONSE", 315)
    label(canvas, "WHAT HAPPENED", 40, 285)
    text_field(canvas, NARRATIVE_FIELD, event_lines[0], 40, 246, 532, 28, size=9)
    text_field(canvas, NARRATIVE_FIELD + "2", event_lines[1], 40, 213, 532, 28, size=9)
    label(canvas, "PERSONS WHO OBSERVED", 40, 180)
    text_field(canvas, "Person(s) who observed the incident/injury1", "Demo Staff Member", 40, 150, 532)
    label(canvas, "IMMEDIATE ACTION", 40, 139)
    text_field(canvas, ACTION_FIELD, action_lines[0], 40, 94, 532, 28, size=9)
    text_field(canvas, ACTION_FIELD + "2", action_lines[1], 40, 59, 532, 28, size=9)
    canvas.showPage()

    page_header(canvas, 2, index)
    section(canvas, "TREATMENT AND FOLLOW-UP", 665)
    label(canvas, "MEDICAL TREATMENT NECESSARY", 40, 634)
    check_field(canvas, "Medical Treatment Necessary", 258, 629, treatment_needed)
    label(canvas, "YES", 276, 633)
    check_field(canvas, "Med Treatment No", 322, 629, not treatment_needed)
    label(canvas, "NO", 340, 633)
    label(canvas, "NATURE OF TREATMENT", 40, 612)
    treatment = "Synthetic evaluation recorded for test workflow only." if treatment_needed else "No treatment - synthetic test case."
    text_field(canvas, "If yes, give nature of treatment", treatment, 40, 581, 532)
    label(canvas, "WHERE ADMINISTERED", 40, 568)
    text_field(canvas, "Where Administered", "Demo setting only", 40, 538, 255)
    label(canvas, "ADMINISTERED BY", 305, 568)
    text_field(canvas, "Administered By", "Demo clinician" if treatment_needed else "Not applicable", 305, 538, 267)
    label(canvas, "FOLLOW-UP TREATMENT", 40, 526)
    text_field(canvas, "FOLLOW-UP TREATMENT, IF ANY", "Demo supervisor will review the synthetic record.", 40, 495, 532)
    label(canvas, "ACTION TAKEN / PLANNED", 40, 482)
    text_field(canvas, "Action Taken Planned, By Whom and Anticipated Results", "Confirm extraction, compare with source, then leave as an unfiled demo report.", 40, 451, 532)
    label(canvas, "SUPERVISOR COMMENTS", 40, 438)
    text_field(canvas, "License/Supervisor Comments", "Synthetic QA fixture - no actual incident or notification.", 40, 407, 532)
    label(canvas, "ATTENDING PHYSICIAN", 40, 394)
    text_field(canvas, "Attending Physician", "Not applicable - test", 40, 363, 532)

    section(canvas, "NOTIFICATIONS", 339)
    check_field(canvas, "Agency icensing Name", 40, 305, index % 2 == 0)
    label(canvas, "Licensing (simulated only; no message sent)", 59, 309, 8)
    text_field(canvas, "Agency Licensing Name1", "Demo notification record" if index % 2 == 0 else "", 40, 273, 532)

    section(canvas, "SUBMISSION AND REVIEW", 249)
    label(canvas, "SUBMITTED BY", 40, 218)
    text_field(canvas, "Name and title section1", "Demo Reporter - QA", 40, 188, 255)
    label(canvas, "DATE", 305, 218)
    text_field(canvas, "Name and Date1", occurred_text, 305, 188, 267)
    label(canvas, "REVIEWED BY", 40, 176)
    text_field(canvas, "Name and Title section2", "Demo Reviewer - QA", 40, 146, 255)
    label(canvas, "DATE", 305, 176)
    text_field(canvas, "Name and Date2", occurred_text, 305, 146, 267)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(RED)
    canvas.drawString(40, 115, "This document was generated for intake testing and must not be filed with the state.")
    canvas.save()

    return {
        "filename": destination.name,
        "index": index,
        "scenario": key,
        "resident": resident,
        "dateOccurred": occurred_text,
        "expectedFacility": "San Pablo Synthetic Demo Facility",
    }


def validate_pdf(path: Path, expected: dict) -> None:
    reader = PdfReader(str(path))
    if len(reader.pages) != 2:
        raise ValueError(f"{path.name}: expected two pages")
    fields = reader.get_fields() or {}
    required = {
        "Facility",
        "Facility File Number",
        "Name of client's residents involved1",
        "Date Occurred",
        NARRATIVE_FIELD,
        ACTION_FIELD,
        "Name and title section1",
        "Name and Date1",
        "Name and Title section2",
        "Name and Date2",
    }
    if required - fields.keys():
        raise ValueError(f"{path.name}: missing required form fields")
    if str(fields["Facility"].get("/V")) != expected["expectedFacility"]:
        raise ValueError(f"{path.name}: incorrect facility value")
    if str(fields["Name of client's residents involved1"].get("/V")) != expected["resident"]:
        raise ValueError(f"{path.name}: incorrect resident value")
    if str(fields["Date Occurred"].get("/V")) != expected["dateOccurred"]:
        raise ValueError(f"{path.name}: incorrect event date")
    widgets = 0
    for page in reader.pages:
        for annotation in page.get("/Annots", []):
            widget = annotation.get_object()
            if widget.get("/Subtype") != "/Widget":
                continue
            widgets += 1
            appearance = widget.get("/AP", {}).get("/N")
            if not appearance:
                raise ValueError(f"{path.name}: widget missing appearance")
    if widgets < len(required):
        raise ValueError(f"{path.name}: too few widgets")
    visible_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if "SYNTHETIC DEMO - NOT A STATE FILING" not in visible_text:
        raise ValueError(f"{path.name}: synthetic warning missing")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.count <= 100:
        parser.error("count must be 1..100")
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for index in range(1, args.count + 1):
        destination = args.output / f"SYNTHETIC-LIC624-San-Pablo-{index:03d}.pdf"
        expected = form_for(index, destination)
        validate_pdf(destination, expected)
        manifest.append(expected)
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Generated and validated {len(manifest)} synthetic fillable LIC 624 PDFs in {args.output}")


if __name__ == "__main__":
    main()
