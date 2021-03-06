const functions = require("firebase-functions");
const cors = require("cors")({ origin: true });

const admin = require("firebase-admin");
admin.initializeApp();
const database = admin.database().ref("/boards/");
const databaseRD = admin.database().ref("/boards/R&D");
const databaseSales = admin.database().ref("/boards/Sales");

const getBoard = (board) => {
  if (board) {
    functions.logger.info(`got board: ${board}`);
    if (board.toUpperCase() === "SALES") {
      return databaseSales;
    } else {
      return databaseRD;
    }
  }
  return null;
};

const getTasksFromDatabase = (boardRef, res) => {
  return boardRef.child("tasks").on(
    "value",
    (snapshot) => {
      let exists = snapshot.val() !== null;
      const tasks = exists ? Object.values(snapshot.val()) : [];

      res.set("Access-Control-Allow-Origin", "*");
      res.status(200).json({ tasks, num_tasks: tasks.length });
    },
    (error) => {
      res.status(500).json({
        message: `Failed to retrieve board tasks. ${error}`,
      });
      functions.logger.info(
        "getTasksFromDatabase: Failed to send client response with db items."
      );
    }
  );
};

/* 
Updates board tasks counter on DB on each create,delete,update operation.
*/
exports.countTasks = functions.database
  .ref(`/boards/{board}/tasks/{task}`)
  .onWrite((change, context) => {
    const collectionRef = change.after.ref.parent;
    const countRef = collectionRef.parent.child("num_tasks");

    return countRef.transaction((current) => {
      if (change.after.exists() && !change.before.exists()) {
        return (current || 0) + 1;
      } else {
        return (current || 0) - 1;
      }
    });
  });

/* 
url: /addTask 
body params: item, board
*/
exports.addTask = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(500).json({
        message: "Method is not allowed",
      });
    }
    try {
      let { item, board } = req.body;
      if (typeof item === "string") {
        item = JSON.parse(req.body.item);
      }

      if (board && item && typeof item === "object") {
        const boardRef = getBoard(board);
        const newTaskRef = boardRef.child("tasks").push();

        newTaskRef.set({ ...item, id: newTaskRef.key }, (e) => {
          if (e) {
            functions.logger.log(`Failed to set task item. ${e.message}`);
            return res.status(500).json({
              message: `Error in addTask: Failed to set task item. ${e.message}`,
            });
          } else {
            functions.logger.log("Document successfully added and updated!");
            getTasksFromDatabase(boardRef, res);
          }
        });
      } else {
        functions.logger.log("Error in getTasks: no board in body");
        return res.status(500).json({
          message: `Error in addTask: no board in body.`,
        });
      }
    } catch (e) {
      functions.logger.log("addTask failed." + e);
      return res.status(500).json({
        message: `Error in addTask: ${e.message}.`,
      });
    }
  });
});

/* 
url: /getTasks?board=${board}
*/
exports.getTasks = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (req.method !== "GET") {
      return res.status(500).json({
        message: "Method is not allowed",
      });
    }

    const board = req.query.board;
    if (board) {
      const boardRef = getBoard(board);
      getTasksFromDatabase(boardRef, res);
    } else {
      functions.logger.log("Error in getTasks: no board in body");
      return res.status(500).json({
        message: `Error in getTasks: no board in query.`,
      });
    }
  });
});

/* 
url: /deleteTask?id=${id}&board=${board}
*/
exports.deleteTask = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (req.method !== "DELETE") {
      return res.status(500).json({
        message: "Method is not allowed",
      });
    }
    const id = req.query.id;
    const board = req.query.board;
    if (board && id) {
      admin
        .database()
        .ref(`/boards/${board}/tasks/${id}`)
        .remove((e) => {
          if (e) {
            functions.logger.log(`Failed to delete task: ${id}. ${e.message}`);
            return res.status(500).json({
              message: `Error in deleteTask: ${e.message}`,
            });
          } else {
            functions.logger.log("Document successfully deleted!");
            const boardRef = getBoard(board);
            getTasksFromDatabase(boardRef, res);
          }
        });
    } else {
      functions.logger.log("Error in deleteTask: no board in query");
      return res.status(500).json({
        message: `Error in deleteTask: no board in query.`,
      });
    }
  });
});

/* 
url: /updateTask
body params: item, board
*/
exports.updateTask = functions.https.onRequest((req, res) => {
  return cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(500).json({
        message: "Method is not allowed",
      });
    }

    try {
      let { item, board } = req.body;
      if (typeof item === "string") {
        item = JSON.parse(req.body.item);
      }

      if (board && item && typeof item === "object") {
        const boardRef = getBoard(board);
        boardRef
          .child("tasks")
          .child(item.id)
          .update(item, (e) => {
            if (e) {
              functions.logger.log(`Failed to updateTask item. ${e.message}`);
              return res.status(500).json({
                message: `Error in updateTask: Failed to update task item. ${e.message}`,
              });
            } else {
              functions.logger.log("Document successfully updated!");
              getTasksFromDatabase(boardRef, res);
            }
          });
      } else {
        functions.logger.log("Error in updateTask: no board in body");
        return res.status(500).json({
          message: `Error in updateTask: no board in body.`,
        });
      }
    } catch (e) {
      functions.logger.log("updateTask failed." + e.message);
      return res.status(500).json({
        message: `Error in updateTask: ${e.message}.`,
      });
    }
  });
});
