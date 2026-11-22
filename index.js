import express from 'express';
import cors from 'cors'
import 'dotenv/config'
import { MongoClient,ObjectId } from 'mongodb';
import Stripe from 'stripe';

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY)
const app = express();
const port = 8000;
app.use(cors());
app.use(express.json())
const client = new MongoClient(process.env.MONGO_DB_URL)

export async function connectToMongoDB() {
  try {
    await client.connect();
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const db=await connectToMongoDB()
   const database = client.db("mentorlagbe");
  const users=database.collection("user")
   const tuitions=database.collection('tuitions')
  const applications=database.collection('applications')
  const payments = database.collection('payments');
   const sessions=database.collection("session")

   
  const verifyToken=async(req,res,next)=>{
  const authHeader=req.headers.authorization
  if(!authHeader){
    res.status(401).send({message:"Unauthorized"})
    return
  }
 const token=authHeader.split(' ')[1]
 if(!token){
  res.status(401).send({message:"Unauthorized"})
  return
 }
 const query={token}
 const session=await sessions.findOne(query)
 if(!session){
  res.status(401).send({message:"Unauthorized"})
  return
 }
 const userId=session.userId
 const userQuery={_id:new ObjectId(userId)}
 const user=await users.findOne(userQuery)
 if(!user){
  res.status(401).send({message:"Unauthorized"})
  return
 }
 req.user=user
 next()
}

const verifyStudent = (req, res, next) => {
  if (req.user?.role?.toLowerCase() !== "student") {
    return res.status(403).send({ message: "Forbidden: Students only" });
  }
  next();
};
const verifyTutor = (req, res, next) => {
  if (req.user?.role?.toLowerCase() !== "tutor") {
    return res.status(403).send({ message: "Forbidden: Tutors only" });
  }
  next();
};
const verifyAdmin = (req, res, next) => {
  if (req.user?.role?.toLowerCase() !== "admin") {
    return res.status(403).send({ message: "Forbidden: Admins only" });
  }
  next();
};

app.get('/', (req, res) => {
  res.send('Hello World!');
});
app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
  const result = await users.find({}).toArray();
  res.send(result);
});
app.get('/users/me', verifyToken, async (req, res) => {
  res.send(req.user);
});
app.get('/tuitions', async(req, res) => {
  const query={}
  if(req.query){
    if(req.query.subject){
      query.subject=req.query.subject
    }
    if(req.query.classLevel){
      query.classLevel=req.query.classLevel
    }
    if(req.query.teachingMode){
      query.teachingMode=req.query.teachingMode
    }
    if (req.query.teacher_id) {
    query.teacher_id = req.query.teacher_id;
  }
  if (req.query.status) {
  query.status = req.query.status;
}
    if (req.query.search) {
  query.$or = [
    { title: { $regex: req.query.search, $options: 'i' } },
    { subject: { $regex: req.query.search, $options: 'i' } },
    { teacher_name: { $regex: req.query.search, $options: 'i' } }
  ];
}
  }
  const result=await tuitions.find(query).toArray()
  res.send(result)
});

app.get('/tuitions/count', async (req, res) => {
  const query = {};
  if (req.query.teacher_id) {
    query.teacher_id = req.query.teacher_id;
  }
  const count = await tuitions.countDocuments(query);
  res.send({ count });
});

app.get("/tuitions/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid tuition ID" });
  }

  const tuition = await tuitions.findOne({ _id: new ObjectId(id) });
  if (!tuition) {
    return res.status(404).send(null);
  }

  let teacherBio = "";
  let teacherImage = "";

  if (tuition.teacher_id && ObjectId.isValid(tuition.teacher_id)) {
    const teacher = await users.findOne(
      { _id: new ObjectId(tuition.teacher_id) },
      { projection: { academicBio: 1, image: 1 } }
    );
    teacherBio = teacher?.academicBio || "";
    teacherImage = teacher?.image || "";
  }

  res.send({
    ...tuition,
    teacherBio,
    teacherImage,
  });
});

app.get("/applications", verifyToken, async (req, res) => {
  const userId = req.user._id.toString();
  const role = req.user.role?.toLowerCase();
  const query = {};

  if (role === "student") {
    query.student_id = userId;
  } else if (role === "tutor") {
    query.teacher_id = userId;
  } else if (role !== "admin") {
    return res.status(403).send({ message: "Forbidden: Access denied" });
  }

  if (req.query.tuition_id) {
    query.tuition_id = req.query.tuition_id;
  }

  const result = await applications.find(query).toArray();
  res.send(result);
});
app.get('/applications/count', async(req, res) => {
  const query={}
   if(req.query){
     if (req.query.student_id) {
    query.student_id = req.query.student_id;
  }
     if (req.query.tuition_id) {
    query.tuition_id = req.query.tuition_id;
  }
   }
  const result=await applications.countDocuments(query)
  res.send({count:result})
});
app.get('/users/:id/premium', async(req, res) => {
 const id=req.params.id
 const query={_id:new ObjectId(id)}
 const result=await users.findOne(query,{projection:{premium:1,plan:1}})
 const isPro=result?.plan==='pro'||result?.premium===true
 res.send({premium:isPro,plan:isPro?'pro':'free'})
});
app.get('/payments', verifyToken, verifyAdmin, async (req, res) => {
  const allPayments = await payments
    .find({})
    .sort({ payment_date: -1 })
    .toArray();

  const allUsers = await users
    .find({}, { projection: { name: 1, email: 1, role: 1 } })
    .toArray();

  const userMap = new Map(allUsers.map((u) => [u._id.toString(), u]));

  const enrichedPayments = allPayments.map((payment) => {
    const matchedUser = userMap.get(payment.userId);
    const role = (payment.role || matchedUser?.role || "student").toLowerCase();
    const isTutor = role === "tutor";

    return {
      ...payment,
      userName: payment.userName || matchedUser?.name || "Unknown User",
      customer_email: payment.customer_email || matchedUser?.email || "",
      role: isTutor ? "Tutor" : "Student",
      plan: payment.plan || (isTutor ? "Pro Tutor Plan" : "Pro Student Plan"),
      amount: payment.amount ?? (isTutor ? 15 : 10),
    };
  });

  res.send(enrichedPayments);
});
app.post('/tuitions', verifyToken, verifyTutor, async (req, res) => {
  const isPro = req.user.plan === 'pro' || req.user.premium === true;

  if (!isPro) {
    const postedCount = await tuitions.countDocuments({
      teacher_id: req.user._id.toString(),
    });
    if (postedCount >= 2) {
      return res.status(403).send({
        success: false,
        message:
          'Free plan allows only 2 tuition posts. Upgrade to Pro for unlimited posting.',
      });
    }
  }

  const tuitionData = {
    status: "pending",
    ...req.body,
    teacher_id: req.user._id.toString(),
  };

  const result = await tuitions.insertOne(tuitionData);
  res.send(result);
});
app.post('/applications', verifyToken, verifyStudent, async (req, res) => {
  const studentId = req.user._id.toString();
  const tuitionId = req.body.tuition_id;

  if (!tuitionId) {
    return res.status(400).send({ message: 'Tuition ID is required' });
  }

  const existingApplication = await applications.findOne({
    tuition_id: tuitionId,
    student_id: studentId,
  });
  if (existingApplication) {
    return res.status(409).send({
      success: false,
      message: 'You have already applied for this tuition.',
    });
  }

  const isPro = req.user.plan === 'pro' || req.user.premium === true;

  if (!isPro) {
    const appliedCount = await applications.countDocuments({
      student_id: studentId,
    });
    if (appliedCount >= 2) {
      return res.status(403).send({
        success: false,
        message:
          'Free plan allows only 2 applications. Upgrade to Pro for unlimited applications.',
      });
    }
  }

  const applicationData = {
    status: "pending",
    ...req.body,
    student_id: studentId,
  };
  const result = await applications.insertOne(applicationData);
  res.send(result);
});
app.post('/payments/checkout_verify', verifyToken, async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.send({ success: false, message: 'SessionId required' });
  }

  const {
    status,
    customer_email,
    metadata,
    payment_intent,
    payment_status,
    amount_total,
    currency,
  } = await stripe.checkout.sessions.retrieve(sessionId);

  if (metadata?.userId !== req.user._id.toString()) {
    return res.status(403).send({ success: false, message: 'Forbidden: User mismatch' });
  }

  if (status === 'complete' && payment_status === 'paid') {
    const existingPayment = await payments.findOne({ sessionId });
    if (existingPayment) {
      return res.send({ success: false, message: 'Payment Already Done' });
    }

    const payment = {
      sessionId,
      status,
      customer_email,
      payment_intent,
      userId: metadata.userId,
      role: metadata.role || req.user.role,
      plan: 'pro',
      amount: amount_total ? amount_total / 100 : undefined,
      currency: currency?.toUpperCase(),
      payment_status,
      payment_date: new Date(),
    };
    const result = await payments.insertOne(payment);

    const updateResult = await users.updateOne(
      { _id: new ObjectId(metadata.userId) },
      { $set: { premium: true, plan: "pro" } }
    );

    return res.send({ success: true, result, updateResult });
  }

  res.send({ success: false, message: 'Payment failed' });
});



app.patch("/users/profile", verifyToken, async (req, res) => {
  const { name, image, phone, academicBio } = req.body;
  const isTutor = req.user.role?.toLowerCase() === "tutor";

  if (isTutor && !academicBio?.trim()) {
    return res.status(400).send({
      message: "Academic Bio / Teaching Experience is required for tutors.",
    });
  }

  const updateFields = {
    ...(name?.trim() && { name: name.trim() }),
    ...(image !== undefined && { image: image.trim() }),
    ...(phone !== undefined && { phone: phone.trim() }),
    ...(academicBio !== undefined && { academicBio: academicBio.trim() }),
    updatedAt: new Date(),
  };

  const result = await users.updateOne(
    { _id: req.user._id },
    { $set: updateFields }
  );
  res.send(result);
});

app.patch('/tuitions/:id', verifyToken, verifyTutor, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid tuition ID" });
  }

  const { _id, teacher_id, ...updatedFields } = req.body;

  const result = await tuitions.updateOne(
    { _id: new ObjectId(id), teacher_id: req.user._id.toString() },
    { $set: { ...updatedFields, updatedAt: new Date() } }
  );

  res.send(result);
});

app.patch('/applications/:id/status', verifyToken, verifyTutor, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!ObjectId.isValid(id) || !["accepted", "rejected", "pending"].includes(status)) {
    return res.status(400).send({ message: "Invalid application ID or status" });
  }

  const result = await applications.updateOne(
    { _id: new ObjectId(id), teacher_id: req.user._id.toString() },
    { $set: { status, updatedAt: new Date() } }
  );

  res.send(result);
});

app.patch('/tuitions/:id/status', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await tuitions.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } }
  );
  res.send(result);
});
app.patch('/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const result = await users.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role, updatedAt: new Date() } }
  );
  res.send(result);
});


app.delete('/applications/:id', verifyToken, verifyStudent, async (req, res) => {
  const { id } = req.params;
  const result = await applications.deleteOne({
    _id: new ObjectId(id),
    student_id: req.user._id.toString(),
    status: "pending",
  });
  res.send(result);
});
app.delete('/tuitions/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };

  if (req.user.role?.toLowerCase() !== "admin") {
    query.teacher_id = req.user._id.toString();
  }

  const result = await tuitions.deleteOne(query);
  res.send(result);
});

if (process.env.VERCEL !== '1') {
  const runtimePort = process.env.PORT || port;
  app.listen(runtimePort, () => {
  });
}
export default app;
