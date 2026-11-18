import express from 'express';
import cors from 'cors'
import 'dotenv/config'
import { MongoClient } from 'mongodb';
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
   const tuitions=database.collection('tuitions')

app.get('/', (req, res) => {
  res.send('Hello World!');
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
app.post('/tuitions', async(req, res) => {
  const query=req.body
  const result=await tuitions.insertOne(query)
  res.send(result)
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});