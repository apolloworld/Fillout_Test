const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY =
  "sk_prod_TfMbARhdgues5AuIosvvdAC9WsA5kXiZlW8HZPaRDlIbCpSpLsXBeZO7dCVZQwHAY3P4VSBPiiC33poZ1tdUj2ljOzdTCCOSpUZ_3912";
const API_ENDPOINT = "https://api.fillout.com/v1/api";

const validateReqQuery = ({ limit, offset, filtersString }) => {
  const parsedLimit = parseInt(limit);
  const parsedOffset = parseInt(offset);
  let filters = null;
  const errors = [];

  try {
    filters = JSON.parse(filtersString ?? "[]");
    if (!Array.isArray(filters)) {
      filters = null;
    }
  } catch {}

  if (filters === null) {
    errors.push({
      code: "invalid_type",
      expected: "array",
      received: filtersString,
      path: ["limit"],
      message: `Expected array, received ${filtersString}`,
    });
  }

  if (isNaN(parsedLimit)) {
    errors.push({
      code: "invalid_type",
      expected: "number",
      received: parsedLimit,
      path: ["limit"],
      message: `Expected number, received ${parsedLimit}`,
    });
  } else if (parsedLimit < 1) {
    errors.push({
      code: "too_small",
      minimum: 1,
      type: "number",
      inclusive: true,
      exact: false,
      received: parsedLimit,
      path: ["limit"],
      message: "Number must be greater than or equal to 1",
    });
  } else if (parsedLimit > 150) {
    errors.push({
      code: "too_big",
      minimum: 150,
      type: "number",
      inclusive: true,
      exact: false,
      received: parsedLimit,
      path: ["limit"],
      message: "Number must be less than or equal to 150",
    });
  }
  if (isNaN(parsedOffset)) {
    errors.push({
      code: "invalid_type",
      expected: "number",
      received: parsedOffset,
      path: ["offset"],
      message: `Expected number, received ${parsedOffset}`,
    });
  } else if (parsedOffset < 0) {
    errors.push({
      code: "too_small",
      minimum: 0,
      type: "number",
      inclusive: true,
      exact: false,
      received: parsedOffset,
      path: ["offset"],
      message: "Number must be greater than or equal to 0",
    });
  }
  return {
    data: { limit: parsedLimit, offset: parsedOffset, filters },
    errors,
  };
};

app.get("/:formId/filteredResponses", async (req, res) => {
  try {
    const { formId } = req.params;
    const {
      filters: filtersString,
      limit = 150,
      offset = 0,
      ...queryParams
    } = req.query;

    // Validate filtersString, limit and offset
    const {
      data: { limit: parsedLimit, offset: parsedOffset, filters },
      errors,
    } = validateReqQuery({ limit, offset, filtersString });
    if (errors.length > 0) {
      return res.status(400).json({
        statusCode: 400,
        error: "Bad Request",
        message: JSON.stringify(errors, null, 2),
      });
    }

    // Fetch all responses from the API
    let allResponses = [];
    let totalResponses = 0;
    let currentOffset = 0;

    while (true) {
      try {
        const response = await axios.get(
          `${API_ENDPOINT}/forms/${formId}/submissions`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
            },
            params: {
              ...queryParams,
              limit: 150,
              offset: currentOffset,
            },
          }
        );

        allResponses = [...allResponses, ...response.data.responses];
        totalResponses = response.data.totalResponses;

        if (allResponses.length >= totalResponses) {
          break;
        }

        currentOffset += 150;
      } catch (error) {
        if (error.response) {
          return res.status(error.response.status).json(error.response.data);
        } else if (error.request) {
          return res
            .status(500)
            .json({ error: "No response received from the Fillout API" });
        } else {
          return res
            .status(500)
            .json({ error: "Error setting up the request to the Fillout API" });
        }
      }
    }
    // Apply filters to the responses
    const filteredResponses = allResponses.filter((response) => {
      return filters.every((filter) => {
        const { id, condition, value } = filter;
        const question = response.questions.find((q) => q.id === id);

        if (!question) {
          return false;
        }

        switch (condition) {
          case "equals":
            return question.value === value;
          case "does_not_equal":
            return question.value !== value;
          case "greater_than":
            return question.value > value;
          case "less_than":
            return question.value < value;
          default:
            return false;
        }
      });
    });

    // Apply pagination to the filtered responses
    const paginatedResponses = filteredResponses.slice(
      parsedOffset,
      parsedOffset + parsedLimit
    );
    const pageCount = Math.ceil(filteredResponses.length / parsedLimit);

    res.json({
      responses: paginatedResponses,
      totalResponses: filteredResponses.length,
      pageCount,
    });
  } catch (error) {
    console.error("Error fetching filtered responses:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
