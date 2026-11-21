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

const myLogger=(req,res,next)=>{
  console.log('now hitting api',req.url,req.query);
  next()

}

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
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

app.get('/', (req, res) => {
  res.send('Hello World!');
});
app.get('/users', async (req, res) => {
const result = await users.find({}).toArray();
  res.send(result);
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

app.get('/tuitions/:id', async (req, res) => {
  const id=req.params.id
  const query={_id: new ObjectId(id) }

 

  const result = await tuitions.findOne(query)

  res.send(result);
});

app.get('/tuitions/count', async (req, res) => {
  const query = {};
  if (req.query.teacher_id) {
    query.teacher_id = req.query.teacher_id;
  }
  const count = await tuitions.countDocuments(query);
  res.send({ count });
});

app.get("/applications", verifyToken, verifyStudent, async (req, res) => {
  const loggedInStudentId = req.user._id.toString();

  if (req.query.student_id && req.query.student_id !== loggedInStudentId) {
    return res.status(403).send({ message: "Forbidden: Access denied" });
  }


  const query = {
    student_id: loggedInStudentId,
  };

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
 const result=await users.findOne(query,{projection:{premium:1}})
 res.send(result)
});

app.post('/tuitions', verifyToken, verifyTutor, async (req, res) => {
  const tuitionData = {
    status: "pending",
    ...req.body,
    teacher_id: req.user._id.toString(),
  };

  const result = await tuitions.insertOne(tuitionData);
  res.send(result);
});
app.post('/applications', verifyToken, verifyStudent, async(req, res) => {
  const query=req.body
  const result=await applications.insertOne(query)
  res.send(result)
});
app.post('/payments/checkout_verify', async (req, res) => {
  const { sessionId } = req.body;
 if(!sessionId){
  return res.send({success:false,message:'SessionId requeired'})
 }
 const {
    status,
    customer_email,
    metadata,
    payment_intent,
    payment_status
  } = await stripe.checkout.sessions.retrieve(sessionId)

if (status === 'complete' && payment_status==='paid'){
  const sessionQuery={sessionId}
  const existingPayment=await payments.findOne(sessionQuery)
  if(existingPayment){
    return res.send({success:false,message:'Payment Already Done'})
  }
  const payment={
  sessionId,
  status,
    customer_email,
    payment_intent,
    userId:metadata.userId,
    payment_status,
    payment_date:new Date()
}
const result=await payments.insertOne(payment)

const query={_id:new ObjectId(metadata.userId)}

const updatedDoc={
  $set:{
    premium:true,
  }
}
const updateResult=await users.updateOne(
    query,
  updatedDoc)
 res.send({sucess:true,result,updateResult})
 return
 }
res.send({success:false,message:'payment failed'})
 
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
app.patch('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const result = await users.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role, updatedAt: new Date() } }
  );

  res.send(result);
});


app.delete('/applications/:id',verifyToken, verifyStudent, async (req, res) => {
  
    const id = req.params.id;
    const result = await applications.deleteOne({
      _id: new ObjectId(id),
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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});