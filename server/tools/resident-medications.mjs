export function buildResidentMedicationPresentation({ orders, displayValue, formatNumber }) {
  const currentOrders = [...orders].sort((left, right) =>
    String(left.medication).localeCompare(String(right.medication))
  );
  const rows = currentOrders.map((order) => ({
    label: order.medication || "Medication",
    value: 0,
    meta: "current_medication",
    cells: [
      order.medication || "Medication",
      displayValue(order.dosage),
      displayValue(order.route),
      displayValue(order.schedule || order.passing_times),
      displayValue(order.indication),
      [
        order.is_prn ? "PRN" : null,
        order.is_psychotropic ? "Psychotropic" : null,
        order.is_narcotic ? "Narcotic" : null,
        order.is_on_hold ? "On hold" : null
      ].filter(Boolean).join(", ") || "Active"
    ]
  }));
  const summary = currentOrders.length
    ? `Current medications include ${currentOrders.slice(0, 5).map((order) => order.medication).join(", ")}${currentOrders.length > 5 ? ` and ${formatNumber(currentOrders.length - 5)} more` : ""}.`
    : "Current medication order detail is unavailable.";
  return { currentOrders, rows, summary };
}
