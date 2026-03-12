import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import referencesRouter from "./references";
import notesRouter from "./notes";
import channelsRouter from "./channels";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(referencesRouter);
router.use(notesRouter);
router.use(channelsRouter);

export default router;
