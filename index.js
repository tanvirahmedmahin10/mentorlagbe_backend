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
app.get('/tuitions/count', async (req, res) => {
  const query = {};
  if (req.query.teacher_id) {
    query.teacher_id = req.query.teacher_id;
  }
  const count = await tuitions.countDocuments(query);
  res.send({ count });
});
app.get('/applications', async(req, res) => {
  const query={}
   if(req.query){
     if (req.query.student_id) {
    query.student_id = req.query.student_id;
  }
     if (req.query.tuition_id) {
    query.tuition_id = req.query.tuition_id;
  }
   }
  const result=await applications.find(query).toArray()
  res.send(result)
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

app.post('/tuitions', async(req, res) => {
  const tuitionData = {
    status: "pending",
    ...req.body,
  };
  const result=await tuitions.insertOne(tuitionData)
  res.send(result)
});
app.post('/applications', async(req, res) => {
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
app.patch('/tuitions/:id', async (req, res) => {
  const { id } = req.params;


  const { _id, ...updatedFields } = req.body;

  const result = await tuitions.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedFields }
  );

  res.send(result);
});
app.patch('/applications/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await applications.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } }
  );

  res.send(result);
});
app.get('/tuitions/:id', async (req, res) => {
  const id=req.params.id
  const query={_id: new ObjectId(id) }

 

  const result = await tuitions.findOne(query)

  res.send(result);
});
app.delete('/applications/:id', async (req, res) => {
  
    const id = req.params.id;
    const result = await applications.deleteOne({
      _id: new ObjectId(id),
      status: "pending",
    });
    res.send(result);

  
});
app.delete('/tuitions/:id', async (req, res) => {
  const { id } = req.params;
  const result = await tuitions.deleteOne({ _id: new ObjectId(id) });
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
app.patch('/tuitions/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await tuitions.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } }
  );

  res.send(result);
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});