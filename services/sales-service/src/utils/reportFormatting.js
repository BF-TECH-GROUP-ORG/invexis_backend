/**
 * Report Formatting and Visualization Utilities
 * Converts raw report data into chart-ready formats
 */

/**
 * Format revenue data for chart visualization
 */
function formatRevenueForChart(trendData) {
  return {
    labels: trendData.map((item) => item.period),
    datasets: [
      {
        label: "Revenue",
        data: trendData.map((item) => parseFloat(item.revenue)),
        borderColor: "#4F46E5",
        backgroundColor: "rgba(79, 70, 229, 0.1)",
        tension: 0.3,
        fill: true,
      },
      {
        label: "Transaction Count",
        data: trendData.map((item) => parseInt(item.transactionCount)),
        borderColor: "#10B981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        yAxisID: "y1",
        tension: 0.3,
      },
    ],
  };
}

/**
 * Format product performance data for bar chart
 */
function formatProductsForChart(products) {
  return {
    labels: products.map((p) => p.productName),
    datasets: [
      {
        label: "Revenue",
        data: products.map((p) => parseFloat(p.totalRevenue)),
        backgroundColor: "#4F46E5",
      },
      {
        label: "Quantity Sold",
        data: products.map((p) => parseInt(p.totalQuantitySold)),
        backgroundColor: "#10B981",
      },
    ],
  };
}

/**
 * Format salesperson performance for leaderboard
 */
function formatSalesPersonLeaderboard(salespeople) {
  return salespeople
    .sort((a, b) => parseFloat(b.totalRevenue) - parseFloat(a.totalRevenue))
    .map((person, index) => ({
      rank: index + 1,
      name: person.soldBy,
      revenue: parseFloat(person.totalRevenue),
      sales: parseInt(person.totalSales),
      average: parseFloat(person.averageSaleValue),
      badge:
        index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "",
    }));
}

/**
 * Format shop performance for comparison
 */
function formatShopsForComparison(shops) {
  return shops.map((shop) => ({
    shopId: shop.shopId,
    revenue: parseFloat(shop.totalRevenue),
    sales: parseInt(shop.totalSales),
    average: parseFloat(shop.averageSaleValue),
    customers: parseInt(shop.uniqueCustomers),
    revenuePerCustomer: (
      parseFloat(shop.totalRevenue) / parseInt(shop.uniqueCustomers)
    ).toFixed(2),
  }));
}

/**
 * Format period comparison for visualization
 */
function formatPeriodComparison(comparison) {
  return {
    period1: {
      label: `${comparison.period1.startDate} to ${comparison.period1.endDate}`,
      revenue: parseFloat(comparison.period1.totalRevenue),
      transactions: parseInt(comparison.period1.totalTransactions),
      average: parseFloat(comparison.period1.averageTransactionValue),
    },
    period2: {
      label: `${comparison.period2.startDate} to ${comparison.period2.endDate}`,
      revenue: parseFloat(comparison.period2.totalRevenue),
      transactions: parseInt(comparison.period2.totalTransactions),
      average: parseFloat(comparison.period2.averageTransactionValue),
    },
    change: {
      revenueChange: parseFloat(comparison.comparison.revenueChange),
      percentageChange: parseFloat(comparison.comparison.percentageChange),
      trend: comparison.comparison.trend,
      arrow: comparison.comparison.trend === "up" ? "↑" : "↓",
    },
  };
}

/**
 * Format payment method breakdown for pie chart
 */
function formatPaymentMethodChart(methods) {
  const colors = [
    "#4F46E5",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#06B6D4",
  ];

  return {
    labels: methods.map((m) => m.paymentMethod || "Unknown"),
    datasets: [
      {
        label: "Transactions",
        data: methods.map((m) => parseInt(m.transactionCount)),
        backgroundColor: colors.slice(0, methods.length),
      },
    ],
  };
}

/**
 * Format category breakdown for stacked bar chart
 */
function formatCategoryChart(categories) {
  return {
    labels: categories.map((c) => c.category || "Uncategorized"),
    datasets: [
      {
        label: "Total Revenue",
        data: categories.map((c) => parseFloat(c.totalRevenue)),
        backgroundColor: "#4F46E5",
      },
      {
        label: "Total Quantity",
        data: categories.map((c) => parseInt(c.totalQuantity)),
        backgroundColor: "#10B981",
      },
    ],
  };
}

/**
 * Generate summary cards data
 */
function generateSummaryCards(report) {
  const revenue = report.revenue;
  return [
    {
      title: "Total Revenue",
      value: `$${parseFloat(revenue.totalRevenue).toLocaleString("en-US", {
        minimumFractionDigits: 2,
      })}`,
      icon: "📊",
      trend: "stable",
    },
    {
      title: "Total Transactions",
      value: parseInt(revenue.totalTransactions).toLocaleString(),
      icon: "💳",
      trend: "up",
    },
    {
      title: "Avg Transaction",
      value: `$${parseFloat(revenue.averageTransactionValue).toFixed(2)}`,
      icon: "📈",
      trend: "up",
    },
    {
      title: "Total Discount",
      value: `$${parseFloat(revenue.totalDiscount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
      })}`,
      icon: "🏷️",
      trend: "down",
    },
  ];
}

/**
 * Generate performance summary with highlights
 */
function generatePerformanceSummary(report) {
  const topProduct =
    report.topProducts && report.topProducts.length > 0
      ? report.topProducts[0]
      : null;
  const topSalesperson =
    report.topSalespeople && report.topSalespeople.length > 0
      ? report.topSalespeople[0]
      : null;
  const topShop =
    report.shopPerformance && report.shopPerformance.length > 0
      ? report.shopPerformance[0]
      : null;

  return {
    topProduct: topProduct
      ? {
          name: topProduct.productName,
          revenue: parseFloat(topProduct.totalRevenue),
          quantity: parseInt(topProduct.totalQuantitySold),
          category: topProduct.category,
        }
      : null,
    topSalesperson: topSalesperson
      ? {
          name: topSalesperson.soldBy,
          revenue: parseFloat(topSalesperson.revenue),
          sales: parseInt(topSalesperson.sales),
        }
      : null,
    topShop: topShop
      ? {
          shopId: topShop.shopId,
          revenue: parseFloat(topShop.totalRevenue),
          sales: parseInt(topShop.totalSales),
          customers: parseInt(topShop.uniqueCustomers),
        }
      : null,
  };
}

/**
 * Generate detailed table data for products
 */
function generateProductTable(products) {
  return products.map((product, index) => ({
    rank: index + 1,
    productId: product.productId,
    productName: product.productName,
    category: product.category,
    quantitySold: parseInt(product.totalQuantitySold),
    revenue: parseFloat(product.totalRevenue),
    avgPrice: parseFloat(product.averageUnitPrice),
    transactions: parseInt(product.transactionCount),
    profitMargin: (
      ((parseFloat(product.totalRevenue) -
        parseFloat(product.grossRevenue)) /
        parseFloat(product.totalRevenue)) *
      100
    ).toFixed(2),
  }));
}

/**
 * Generate detailed table data for salespeople
 */
function generateSalesPersonTable(salespeople) {
  return salespeople
    .map((person, index) => ({
      rank: index + 1,
      name: person.soldBy,
      totalSales: parseInt(person.totalSales),
      totalRevenue: parseFloat(person.totalRevenue),
      averageValue: parseFloat(person.averageSaleValue),
      grossRevenue: parseFloat(person.grossRevenue),
      totalDiscount: parseFloat(person.totalDiscount),
      discountPercentage: (
        (parseFloat(person.totalDiscount) / parseFloat(person.grossRevenue)) *
        100
      ).toFixed(2),
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

/**
 * Generate KPI metrics
 */
function generateKPIs(report) {
  const revenue = report.revenue;
  const topProducts = report.topProducts || [];
  const topSalespeople = report.topSalespeople || [];

  return {
    revenuePerTransaction: (
      parseFloat(revenue.totalRevenue) / parseInt(revenue.totalTransactions)
    ).toFixed(2),
    discountRatio: (
      (parseFloat(revenue.totalDiscount) / parseFloat(revenue.totalSubTotal)) *
      100
    ).toFixed(2),
    taxRate: (
      (parseFloat(revenue.totalTax) / parseFloat(revenue.totalSubTotal)) * 100
    ).toFixed(2),
    productCount: topProducts.length,
    salespersonCount: topSalespeople.length,
    topProductShare: topProducts.length > 0
      ? (
          (parseFloat(topProducts[0].totalRevenue) /
            parseFloat(revenue.totalRevenue)) *
          100
        ).toFixed(2)
      : 0,
    topSalespersonShare: topSalespeople.length > 0
      ? (
          (parseFloat(topSalespeople[0].revenue) /
            parseFloat(revenue.totalRevenue)) *
          100
        ).toFixed(2)
      : 0,
  };
}

/**
 * Export data to CSV format
 */
function exportToCSV(data, filename) {
  const csv = convertArrayToCSV(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Convert array to CSV
 */
function convertArrayToCSV(data) {
  if (!data || data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma
          return typeof value === "string" && value.includes(",")
            ? `"${value.replace(/"/g, '""')}"`
            : value;
        })
        .join(",")
    ),
  ].join("\n");

  return csvContent;
}

/**
 * Format date range for display
 */
function formatDateRange(startDate, endDate) {
  const options = { year: "numeric", month: "short", day: "numeric" };
  const start = new Date(startDate).toLocaleDateString("en-US", options);
  const end = new Date(endDate).toLocaleDateString("en-US", options);
  return `${start} - ${end}`;
}

/**
 * Get color based on trend
 */
function getTrendColor(trend) {
  switch (trend) {
    case "up":
      return "#10B981"; // Green
    case "down":
      return "#EF4444"; // Red
    case "stable":
      return "#6B7280"; // Gray
    default:
      return "#6B7280";
  }
}

module.exports = {
  formatRevenueForChart,
  formatProductsForChart,
  formatSalesPersonLeaderboard,
  formatShopsForComparison,
  formatPeriodComparison,
  formatPaymentMethodChart,
  formatCategoryChart,
  generateSummaryCards,
  generatePerformanceSummary,
  generateProductTable,
  generateSalesPersonTable,
  generateKPIs,
  exportToCSV,
  convertArrayToCSV,
  formatDateRange,
  getTrendColor,
};
